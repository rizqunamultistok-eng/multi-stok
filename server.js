import express from 'express';
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabaseRuntimeConfig } from './supabase-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const cacheDir = path.join(__dirname, 'data');
const cacheFile = path.join(cacheDir, 'local-state.json');
const runtimeSupabaseConfig = getSupabaseRuntimeConfig(process.env);
const supabaseUrl = runtimeSupabaseConfig.url;
const supabaseServiceRoleKey = runtimeSupabaseConfig.serviceRoleKey;
const supabaseKey = runtimeSupabaseConfig.anonKey;
const hasSupabaseConfig = runtimeSupabaseConfig.isConfigured;
let lastSupabaseWarningAt = 0;

let lastRemoteSyncAt = 0;
let remoteSyncInProgress = false;
let isSupabaseReachable = true;
let pendingQueueRunning = false;
const saleDeleteLocks = new Map();
const receiptSaveLocks = new Map();
const DEFAULT_MIN_STOCK_SETTINGS = { defaultMinimum: 10, categoryMinimums: {} };

function warnSupabaseDisabledOnce(message) {
  const now = Date.now();
  if (now - lastSupabaseWarningAt > 60_000) {
    console.warn(message);
    lastSupabaseWarningAt = now;
  }
}

function normalizeMinStockSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const defaultMinimum = Number.isInteger(source.defaultMinimum) && source.defaultMinimum >= 0
    ? source.defaultMinimum
    : DEFAULT_MIN_STOCK_SETTINGS.defaultMinimum;
  const categoryMinimums = {};
  if (source.categoryMinimums && typeof source.categoryMinimums === 'object' && !Array.isArray(source.categoryMinimums)) {
    for (const [category, minimum] of Object.entries(source.categoryMinimums)) {
      const cleanCategory = category.trim();
      if (cleanCategory && Number.isInteger(minimum) && minimum >= 0) categoryMinimums[cleanCategory] = minimum;
    }
  }
  return { defaultMinimum, categoryMinimums };
}

async function acquireSaleDeleteLock(saleId) {
  const previous = saleDeleteLocks.get(saleId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const lock = previous.then(() => current);
  saleDeleteLocks.set(saleId, lock);
  await previous;

  return () => {
    release();
    if (saleDeleteLocks.get(saleId) === lock) saleDeleteLocks.delete(saleId);
  };
}

async function acquireReceiptSaveLock(invoiceNumber) {
  const previous = receiptSaveLocks.get(invoiceNumber) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const lock = previous.then(() => current);
  receiptSaveLocks.set(invoiceNumber, lock);
  await previous;

  return () => {
    release();
    if (receiptSaveLocks.get(invoiceNumber) === lock) receiptSaveLocks.delete(invoiceNumber);
  };
}

app.use(express.json({ limit: '50mb' }));

const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normalizeCachedUser = (user) => {
  const legacyRoleMap = {
    kasir: 'toko',
    kasir_toko: 'toko',
    etalase: 'toko',
    kasir_online: 'online',
    kasir_reseller: 'reseller',
    kasir_cacat: 'cacat',
  };
  const normalized = legacyRoleMap[user?.role] ? { ...user, role: legacyRoleMap[user.role] } : { ...user };
  delete normalized.shift;
  return normalized;
};
const stableUuid = (value) => {
  const hex = createHash('sha256').update(String(value)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const normalizeRow = (table, row) => {
  if (!row || typeof row !== 'object') return row;
  const copy = { ...row };
  if (table === 'mutasi_stok') {
    delete copy.namabarang;
  }
  if (copy.user_id !== undefined) {
    copy.user_id = isUuid(copy.user_id) ? copy.user_id : null;
  }
  if (copy.pemohon_id !== undefined) {
    copy.pemohon_id = isUuid(copy.pemohon_id) ? copy.pemohon_id : null;
  }
  if (copy.disetujui_oleh_id !== undefined) {
    copy.disetujui_oleh_id = isUuid(copy.disetujui_oleh_id) ? copy.disetujui_oleh_id : null;
  }
  if (table === 'permintaan_mutasi' && copy.nomor_permintaan && copy.kodebarang && copy.pemohon_role && copy.pemohon_name && copy.created_at) {
    const createdAt = Date.parse(copy.created_at);
    if (Number.isFinite(createdAt)) {
      copy.id = stableUuid(`permintaan_mutasi:${copy.nomor_permintaan}:${copy.kodebarang}:${copy.pemohon_role}:${copy.pemohon_name}:${createdAt}`);
    }
  } else if (!['barang', 'suppliers', 'barang_masuk', 'stok_gudang', 'stok_toko', 'stok_reseller', 'stok_online', 'stok_cacat'].includes(table)) {
    copy.id = isUuid(copy.id) ? copy.id : stableUuid(`${table}:${copy.id || copy.nomor_permintaan || JSON.stringify(copy)}`);
  }
  return copy;
};

async function readCache() {
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const state = JSON.parse(raw);
    return {
      barang: Array.isArray(state.barang) ? state.barang : [],
      users: Array.isArray(state.users) ? state.users.map(normalizeCachedUser) : [],
      mutasi: Array.isArray(state.mutasi) ? state.mutasi : [],
      opname: Array.isArray(state.opname) ? state.opname : [],
      penjualan: Array.isArray(state.penjualan) ? state.penjualan : [],
      permintaanMutasi: mergeMutationRequests([], Array.isArray(state.permintaanMutasi) ? state.permintaanMutasi : []),
      returStok: Array.isArray(state.returStok) ? state.returStok : [],
      suppliers: Array.isArray(state.suppliers) ? state.suppliers : [],
      barangMasuk: Array.isArray(state.barangMasuk) ? state.barangMasuk : [],
      opnameEnabled: typeof state.opnameEnabled === 'boolean' ? state.opnameEnabled : true,
      minStockSettings: normalizeMinStockSettings(state.minStockSettings),
      updatedAt: state.updatedAt || null,
      source: state.source || 'empty-cache',
      collectionsReady: Array.isArray(state.mutasi) && Array.isArray(state.opname) && Array.isArray(state.penjualan) && Array.isArray(state.permintaanMutasi),
      deleted: { barang: [], mutasi: [], opname: [], penjualan: [], permintaanMutasi: [], barangMasuk: [], ...(state.deleted || {}) },
      pendingQueue: Array.isArray(state.pendingQueue) ? state.pendingQueue : [],
      pendingUserQueue: Array.isArray(state.pendingUserQueue) ? state.pendingUserQueue : [],
    };
  } catch {
    return {
      barang: [],
      users: [],
      mutasi: [],
      opname: [],
      penjualan: [],
      permintaanMutasi: [],
      returStok: [],
      suppliers: [],
      barangMasuk: [],
      opnameEnabled: true,
      minStockSettings: DEFAULT_MIN_STOCK_SETTINGS,
      updatedAt: null,
      source: 'empty-cache',
      collectionsReady: false,
      deleted: { barang: [], mutasi: [], opname: [], penjualan: [], permintaanMutasi: [], barangMasuk: [] },
      pendingQueue: [],
      pendingUserQueue: [],
    };
  }
}

async function writeCache(state) {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(state), 'utf8');
}

function mergeRecords(existing, incoming) {
  const map = new Map(existing.map((item) => [item.id || item.kodebarang, item]));
  for (const item of incoming) {
    const key = item.id || item.kodebarang;
    if (key) map.set(key, { ...map.get(key), ...item });
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.created_at || b.updated_at || '').localeCompare(String(a.created_at || a.updated_at || ''))
  );
}

function mutationRequestKey(item) {
  const createdAt = Date.parse(item.created_at || '');
  if (item.nomor_permintaan && item.kodebarang && item.pemohon_role && item.pemohon_name && Number.isFinite(createdAt)) {
    return JSON.stringify([item.nomor_permintaan, item.kodebarang, item.pemohon_role, item.pemohon_name, createdAt]);
  }
  return item.id || JSON.stringify(item);
}

function mergeMutationRequests(existing, incoming) {
  const map = new Map();
  for (const item of [...existing, ...incoming]) {
    const key = mutationRequestKey(item);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, item);
      continue;
    }
    const previousTime = Date.parse(previous.updated_at || previous.created_at || '') || 0;
    const incomingTime = Date.parse(item.updated_at || item.created_at || '') || 0;
    const older = incomingTime >= previousTime ? previous : item;
    const newer = incomingTime >= previousTime ? item : previous;
    map.set(key, { ...older, ...newer });
  }
  return Array.from(map.values()).sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );
}

// Supabase Cloud REST helpers
async function supabaseFetch(endpoint, options = {}) {
  if (!hasSupabaseConfig) {
    const error = new Error('Supabase belum dikonfigurasi. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di .env sebelum menjalankan cloud sync.');
    error.status = 503;
    throw error;
  }
  const url = `${supabaseUrl}/rest/v1/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeout || 15000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Supabase ${endpoint} [HTTP ${response.status}]: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

async function usersAdminFetch(endpoint, options = {}) {
  if (!supabaseServiceRoleKey) {
    const error = new Error('SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeout || 15000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`Supabase users [HTTP ${response.status}]: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

async function verifyCloudAdmin(credentials) {
  const email = String(credentials?.email || '').trim().toLowerCase();
  const password = String(credentials?.password || '');
  if (!email || !password) {
    const error = new Error('Kredensial Admin cloud tidak tersedia. Silakan login ulang.');
    error.status = 401;
    throw error;
  }
  const query = new URLSearchParams({
    select: 'id,email,password,role,active',
    email: `eq.${email}`,
    limit: '1',
  });
  const response = await usersAdminFetch(`users?${query}`);
  const [admin] = await response.json();
  if (!admin || admin.role !== 'admin' || !admin.active || admin.password !== password) {
    const error = new Error('Autentikasi Admin cloud gagal. Periksa email dan password Admin.');
    error.status = 401;
    throw error;
  }
  return admin;
}

async function fetchCloudUsers() {
  const response = await usersAdminFetch(
    'users?select=id,email,name,role,active,avatar,signature,password,created_at&order=created_at.asc'
  );
  return response.json();
}

function applyPendingUserChanges(users, pendingChanges) {
  let result = [...users];
  for (const change of pendingChanges) {
    if (change.action === 'upsert' && change.user) {
      const index = result.findIndex((user) => user.id === change.user.id || user.email === change.user.email);
      if (index >= 0) result[index] = { ...result[index], ...change.user };
      else result.push(change.user);
    } else if (change.action === 'delete') {
      result = result.filter((user) => user.id !== change.userId && user.email !== change.email);
    }
  }
  return result;
}

function cacheUser(cache, user) {
  const index = cache.users.findIndex((existing) => existing.id === user.id || existing.email === user.email);
  if (index >= 0) cache.users[index] = { ...cache.users[index], ...user };
  else cache.users.push(user);
}

function queueUserChange(cache, change) {
  const id = change.user?.id || change.userId;
  const email = change.user?.email || change.email;
  cache.pendingUserQueue = cache.pendingUserQueue.filter((pending) => {
    const pendingId = pending.user?.id || pending.userId;
    const pendingEmail = pending.user?.email || pending.email;
    return !((id && pendingId === id) || (email && pendingEmail === email));
  });
  cache.pendingUserQueue.push(change);
}

function clearQueuedUserChange(cache, id, email) {
  cache.pendingUserQueue = cache.pendingUserQueue.filter((pending) => {
    const pendingId = pending.user?.id || pending.userId;
    const pendingEmail = pending.user?.email || pending.email;
    return !((id && pendingId === id) || (email && pendingEmail === email));
  });
}

async function pushUserChange(change) {
  if (change.action === 'upsert') {
    await usersAdminFetch('users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(change.user),
    });
    return;
  }
  const filter = isUuid(change.userId)
    ? `id=eq.${encodeURIComponent(change.userId)}`
    : `email=eq.${encodeURIComponent(change.email)}`;
  await usersAdminFetch(`users?${filter}`, { method: 'DELETE' });
}

async function flushPendingUserQueue() {
  if (!supabaseServiceRoleKey) return;
  const cache = await readCache();
  const remaining = [];
  for (const change of cache.pendingUserQueue) {
    try {
      await pushUserChange(change);
    } catch {
      remaining.push(change);
    }
  }
  if (remaining.length !== cache.pendingUserQueue.length) {
    cache.pendingUserQueue = remaining;
    await writeCache(cache);
  }
}

async function verifyServerAdmin(credentials, cache) {
  try {
    return await verifyCloudAdmin(credentials);
  } catch (error) {
    if (error.status === 401) throw error;
    const email = String(credentials?.email || '').trim().toLowerCase();
    const password = String(credentials?.password || '');
    const cachedAdmin = cache.users.find(
      (user) => user.email.toLowerCase() === email && user.role === 'admin' && user.active && user.password === password,
    );
    if (cachedAdmin) return cachedAdmin;
    throw error;
  }
}

async function authenticateServerUser(identifier, password) {
  let cache = await readCache();
  let cloudAvailable = false;
  if (supabaseServiceRoleKey) {
    try {
      await flushPendingUserQueue();
      const cloudUsers = await fetchCloudUsers();
      cache = await readCache();
      cache.users = applyPendingUserChanges(cloudUsers, cache.pendingUserQueue).map(normalizeCachedUser);
      await writeCache(cache);
      cloudAvailable = true;
    } catch {
      // The shared server cache remains usable when Supabase is offline.
    }
  }

  const cleanIdentifier = String(identifier || '').trim().toLowerCase();
  const cleanPassword = String(password || '');
  const user = cache.users.find((candidate) =>
    candidate.active &&
    (candidate.id.toLowerCase() === cleanIdentifier ||
      candidate.email.toLowerCase() === cleanIdentifier ||
      candidate.role.toLowerCase() === cleanIdentifier ||
      candidate.name.toLowerCase() === cleanIdentifier) &&
    candidate.password === cleanPassword
  );
  if (!user) {
    const error = new Error(cache.users.length
      ? 'Pengguna tidak ditemukan, password salah, atau akun tidak aktif.'
      : 'Cache user server kosong dan Supabase belum dapat dihubungi.');
    error.status = cache.users.length ? 401 : 503;
    throw error;
  }
  return { user, cloudAvailable };
}

const barangDependentTables = new Set([
  'mutasi_stok', 'permintaan_mutasi', 'stok_gudang', 'stok_toko',
  'stok_reseller', 'stok_online', 'stok_cacat',
]);
const stockLocationByTable = {
  stok_gudang: 'gudang',
  stok_toko: 'toko',
  stok_reseller: 'reseller',
  stok_online: 'online',
  stok_cacat: 'cacat',
};

async function ensureBarangParents(table, rows) {
  if (!barangDependentTables.has(table)) return rows;

  const cache = await readCache();
  const deletedCodes = new Set(cache.deleted?.barang || []);
  const cachedByCode = new Map(cache.barang.map((item) => [item.kodebarang, item]));
  let activeRows = rows.filter((row) =>
    row.kodebarang && !deletedCodes.has(row.kodebarang) && cachedByCode.has(row.kodebarang),
  );

  if (table === 'mutasi_stok') {
    const importMasterBatch = activeRows.length > 100 && activeRows.every((row) => row.tipe === 'import_master');
    const mutationTimes = importMasterBatch
      ? activeRows.map((row) => Date.parse(row.created_at || '')).filter(Number.isFinite)
      : [];
    const latestMutationAt = mutationTimes.length > 0 ? Math.max(...mutationTimes) : 0;
    const earliestMutationAt = mutationTimes.length > 0 ? Math.min(...mutationTimes) : 0;
    const latestMasterUpdatedAt = Math.max(
      0,
      ...cache.barang.map((item) => Date.parse(item.updated_at || '')).filter(Number.isFinite),
    );
    const isStaleImportBatch = mutationTimes.length === activeRows.length
      && latestMutationAt - earliestMutationAt < 5 * 60 * 1000
      && latestMasterUpdatedAt - latestMutationAt > 5 * 60 * 1000;

    if (isStaleImportBatch) {
      console.log(`[Sync Queue] Lewati batch ${activeRows.length} mutasi import master yang mendahului master aktif.`);
      activeRows = [];
    }

    const staleImportIds = new Set(activeRows.filter((row) => {
      if (row.tipe !== 'import_master') return false;
      const masterUpdatedAt = Date.parse(cachedByCode.get(row.kodebarang)?.updated_at || '');
      const mutationCreatedAt = Date.parse(row.created_at || '');
      return Number.isFinite(masterUpdatedAt) && Number.isFinite(mutationCreatedAt)
        && masterUpdatedAt - mutationCreatedAt > 5 * 60 * 1000;
    }).map((row) => row.id));
    if (staleImportIds.size > 0) {
      activeRows = activeRows.filter((row) => !staleImportIds.has(row.id));
      console.log(`[Sync Queue] Lewati ${staleImportIds.size} mutasi import master dari versi database lama.`);
    }
  }

  const stockLocation = stockLocationByTable[table];
  if (stockLocation) {
    activeRows = activeRows.map((row) => {
      const currentBarang = cachedByCode.get(row.kodebarang);
      const locationValue = currentBarang.stok_lokasi?.[stockLocation];
      const currentStock = Number(locationValue !== undefined
        ? locationValue
        : currentBarang.lokasi === stockLocation ? currentBarang.stok : NaN);
      return Number.isFinite(currentStock)
        ? { ...row, stok: currentStock, updated_at: currentBarang.updated_at || row.updated_at }
        : row;
    });
  }

  const codes = Array.from(new Set(activeRows.map((row) => row.kodebarang)));
  if (codes.length === 0) {
    if (rows.length > 0) console.log(`[Sync Queue] Lewati ${rows.length} baris ${table} yang sudah tidak berlaku.`);
    return activeRows;
  }

  const cloudCodes = new Set();
  const lookupChunkSize = 200;
  for (let index = 0; index < codes.length; index += lookupChunkSize) {
    const chunk = codes.slice(index, index + lookupChunkSize);
    const encodedCodes = chunk
      .map((code) => `"${String(code).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      .join(',');
    const query = new URLSearchParams({ select: 'kodebarang', kodebarang: `in.(${encodedCodes})` });
    const response = await supabaseFetch(`barang?${query}`);
    for (const item of await response.json()) cloudCodes.add(item.kodebarang);
  }

  const missingCodes = codes.filter((code) => !cloudCodes.has(code));
  if (missingCodes.length > 0) {
    await pushTableRows('barang', missingCodes.map((code) => cachedByCode.get(code)));
  }
  return activeRows;
}

async function pushTableRows(table, rows) {
  if (!rows || rows.length === 0) return;
  const preparedRows = await ensureBarangParents(table, rows);
  if (preparedRows.length === 0) return;
  const normalized = preparedRows.map((r) => normalizeRow(table, r));
  // Batch in chunks of 200 to prevent payload limits
  const chunkSize = 200;
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    const conflictTarget = table === 'permintaan_mutasi'
      ? `?${new URLSearchParams({ on_conflict: 'nomor_permintaan,kodebarang,pemohon_role,pemohon_name,created_at' })}`
      : table === 'penjualan_history'
      ? `?${new URLSearchParams({ on_conflict: 'transaction_id,kodebarang' })}`
      : table === 'suppliers'
      ? `?${new URLSearchParams({ on_conflict: 'kode' })}`
      : table === 'barang_masuk'
      ? `?${new URLSearchParams({ on_conflict: 'nomor_faktur' })}`
      : table === 'barang_masuk_detail'
      ? `?${new URLSearchParams({ on_conflict: 'nomor_faktur,kodebarang' })}`
      : '';
    await supabaseFetch(`${table}${conflictTarget}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
      timeout: 30000,
    });
  }
}

function normalizeFilterValue(table, filterCol, filterVal) {
  if (filterCol !== 'id' || table === 'barang' || isUuid(filterVal)) return filterVal;
  return stableUuid(`${table}:${filterVal}`);
}

async function updateTableRow(table, filterCol, filterVal, updates) {
  const normalized = normalizeRow(table, updates);
  if (updates.id === undefined) delete normalized.id;
  const normalizedFilter = normalizeFilterValue(table, filterCol, filterVal);
  await supabaseFetch(`${table}?${encodeURIComponent(filterCol)}=eq.${encodeURIComponent(normalizedFilter)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(normalized),
  });
}

async function deleteTableRow(table, filterCol, filterVal) {
  const normalizedFilter = normalizeFilterValue(table, filterCol, filterVal);
  await supabaseFetch(`${table}?${encodeURIComponent(filterCol)}=eq.${encodeURIComponent(normalizedFilter)}`, {
    method: 'DELETE',
  });
}

async function deleteReceiptInCloud(payload) {
  return supabaseFetch('rpc/fn_delete_barang_masuk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function clearRemoteData() {
  await supabaseFetch('barang?kodebarang=neq.__NON_EXISTING__', { method: 'DELETE' });
  await supabaseFetch('mutasi_stok?id=neq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
  await supabaseFetch('penjualan_history?id=neq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
  await supabaseFetch('permintaan_mutasi?id=neq.00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
}

// Background Queue Processor for Cloud Sync
async function processPendingQueue() {
  if (pendingQueueRunning) return;
  pendingQueueRunning = true;
  try {
    const cached = await readCache();
    if (!cached.pendingQueue || cached.pendingQueue.length === 0) return;

    const remaining = [];
    for (const task of cached.pendingQueue) {
      try {
        if (task.type === 'push_rows') {
          await pushTableRows(task.table, task.rows);
        } else if (task.type === 'clear_remote_data') {
          await clearRemoteData();
        } else if (task.type === 'update_row') {
          await updateTableRow(task.table, task.filterCol, task.filterVal, task.updates);
        } else if (task.type === 'delete_row') {
          await deleteTableRow(task.table, task.filterCol, task.filterVal);
        } else if (task.type === 'delete_receipt') {
          await deleteReceiptInCloud(task.payload);
        }
        isSupabaseReachable = true;
      } catch (err) {
        isSupabaseReachable = false;
        console.warn(`[Sync Queue] Retry pending for ${task.type} on ${task.table}:`, err.message);
        remaining.push(task);
      }
    }

    if (remaining.length !== cached.pendingQueue.length) {
      cached.pendingQueue = remaining;
      await writeCache(cached);
      console.log(`[Sync Queue] Sisa antrean sync ke cloud: ${remaining.length}`);
    }
  } catch (error) {
    console.warn('[Sync Queue] Error proses antrean:', error.message);
  } finally {
    pendingQueueRunning = false;
  }
}

async function queueOrExecute(task) {
  try {
    if (task.type === 'push_rows') {
      await pushTableRows(task.table, task.rows);
    } else if (task.type === 'clear_remote_data') {
      await clearRemoteData();
    } else if (task.type === 'update_row') {
      await updateTableRow(task.table, task.filterCol, task.filterVal, task.updates);
    } else if (task.type === 'delete_row') {
      await deleteTableRow(task.table, task.filterCol, task.filterVal);
    } else if (task.type === 'delete_receipt') {
      await deleteReceiptInCloud(task.payload);
    }
    isSupabaseReachable = true;
    return { success: true };
  } catch (err) {
    if (task.type === 'delete_receipt' && err.status) {
      isSupabaseReachable = true;
      return { success: false, message: err.message };
    }
    isSupabaseReachable = false;
    console.warn(`[Cloud Proxy] Gagal kirim ke cloud langsung (${task.type}), antrekan untuk retry:`, err.message);
    const cached = await readCache();
    cached.pendingQueue = cached.pendingQueue || [];
    cached.pendingQueue.push(task);
    await writeCache(cached);
    return { success: true, queued: true };
  }
}

// Refresh Local Cache periodically by pulling latest data from Supabase Cloud
async function refreshLocalCache() {
  const now = Date.now();
  if (remoteSyncInProgress || now - lastRemoteSyncAt < 25_000) return;
  remoteSyncInProgress = true;

  try {
    if (!hasSupabaseConfig) {
      warnSupabaseDisabledOnce('[Sync] Cloud Supabase belum dikonfigurasi. Server tetap memakai cache lokal.');
      isSupabaseReachable = false;
      return;
    }

    const cached = await readCache();

    // Test ping
    const pingRes = await fetch(`${supabaseUrl}/rest/v1/barang?select=kodebarang&limit=1`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!pingRes.ok) throw new Error(`Supabase unreachable HTTP ${pingRes.status}`);
    isSupabaseReachable = true;

    // Flush any pending queue first
    await processPendingQueue();
    await flushPendingUserQueue();

    // Pull remote tables
    const [mutasiRes, opnameRes, penjualanRes, permintaanRes, returStokRes, suppliersRes, receiptsRes, receiptDetailsRes] = await Promise.allSettled([
      supabaseFetch('mutasi_stok?select=*&order=created_at.desc&limit=100').then((r) => r.json()),
      supabaseFetch('opname_history?select=*&order=created_at.desc&limit=50').then((r) => r.json()),
      supabaseFetch('penjualan_history?select=*&order=created_at.desc&limit=100').then((r) => r.json()),
      supabaseFetch('permintaan_mutasi?select=*&order=created_at.desc&limit=100').then((r) => r.json()),
      supabaseFetch('retur_stok?select=*&order=created_at.desc&limit=200').then((r) => r.json()),
      supabaseFetch('suppliers?select=*&order=nama.asc').then((r) => r.json()),
      supabaseFetch('barang_masuk?select=*&order=tanggal.desc,created_at.desc&limit=200').then((r) => r.json()),
      supabaseFetch('barang_masuk_detail?select=*&order=created_at.asc').then((r) => r.json()),
    ]);

    const deleted = cached.deleted || { barang: [], mutasi: [], opname: [], penjualan: [], permintaanMutasi: [] };
    const filterDeleted = (col, rows) => {
      const delSet = new Set(deleted[col] || []);
      return rows.filter((r) => !delSet.has(r.id) && !delSet.has(r.kodebarang) && !delSet.has(r.nomor_permintaan));
    };

    let finalSuppliers = suppliersRes.status === 'fulfilled' ? suppliersRes.value : cached.suppliers;
    if (suppliersRes.status === 'fulfilled') {
      const remoteSupplierCodes = new Set(finalSuppliers.map((supplier) => supplier.kode));
      const localOnlySuppliers = cached.suppliers.filter((supplier) => !remoteSupplierCodes.has(supplier.kode));
      if (localOnlySuppliers.length > 0) {
        await queueOrExecute({ type: 'push_rows', table: 'suppliers', rows: localOnlySuppliers });
        finalSuppliers = [...finalSuppliers, ...localOnlySuppliers];
      }
    }
    const deletedReceipts = new Set(deleted.barangMasuk || []);
    const detailsByReceipt = new Map();
    if (receiptDetailsRes.status === 'fulfilled') {
      for (const detail of receiptDetailsRes.value) {
        const items = detailsByReceipt.get(detail.nomor_faktur) || [];
        items.push(detail);
        detailsByReceipt.set(detail.nomor_faktur, items);
      }
    }
    const receiptMap = new Map(
      cached.barangMasuk
        .filter((receipt) => !deletedReceipts.has(receipt.nomor_faktur))
        .map((receipt) => [receipt.nomor_faktur, receipt]),
    );
    if (receiptsRes.status === 'fulfilled') {
      for (const receipt of receiptsRes.value) {
        if (deletedReceipts.has(receipt.nomor_faktur)) continue;
        receiptMap.set(receipt.nomor_faktur, {
          ...receiptMap.get(receipt.nomor_faktur),
          ...receipt,
          items: detailsByReceipt.get(receipt.nomor_faktur) || receiptMap.get(receipt.nomor_faktur)?.items || [],
        });
      }
    }
    const finalReceipts = Array.from(receiptMap.values()).sort((first, second) =>
      String(second.tanggal || second.created_at).localeCompare(String(first.tanggal || first.created_at)),
    );

    // If cache barang is empty, load remote barang pages
    let finalBarang = cached.barang;
    if (cached.barang.length === 0) {
      const rows = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const pageRes = await supabaseFetch(`barang?select=*&order=kodebarang.asc&offset=${from}&limit=${pageSize}`);
        const page = await pageRes.json();
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      finalBarang = filterDeleted('barang', rows);
    }

    const state = {
      ...cached,
      barang: finalBarang,
      mutasi: mergeRecords(cached.mutasi, filterDeleted('mutasi', mutasiRes.status === 'fulfilled' ? mutasiRes.value : [])),
      opname: mergeRecords(cached.opname, filterDeleted('opname', opnameRes.status === 'fulfilled' ? opnameRes.value : [])),
      penjualan: mergeRecords(cached.penjualan, filterDeleted('penjualan', penjualanRes.status === 'fulfilled' ? penjualanRes.value : [])),
      permintaanMutasi: mergeMutationRequests(cached.permintaanMutasi, filterDeleted('permintaanMutasi', permintaanRes.status === 'fulfilled' ? permintaanRes.value : [])),
      returStok: mergeRecords(cached.returStok, filterDeleted('returStok', returStokRes.status === 'fulfilled' ? returStokRes.value : [])),
      suppliers: finalSuppliers,
      barangMasuk: finalReceipts,
      updatedAt: new Date().toISOString(),
      source: 'supabase',
      deleted,
    };

    await writeCache(state);
    lastRemoteSyncAt = Date.now();
  } catch (error) {
    isSupabaseReachable = false;
    console.warn('[Sync] Supabase sync gagal, tetap gunakan cache lokal LAN:', error.message);
  } finally {
    remoteSyncInProgress = false;
  }
}

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// 1. Sync & Health Status endpoint
app.get('/api/sync/status', async (_req, res) => {
  const cached = await readCache();
  res.json({
    serverOnline: true,
    isSupabaseReachable,
    pendingQueueCount: cached.pendingQueue?.length || 0,
    itemCounts: {
      barang: cached.barang.length,
      mutasi: cached.mutasi.length,
      opname: cached.opname.length,
      penjualan: cached.penjualan.length,
      permintaanMutasi: cached.permintaanMutasi.length,
    },
    updatedAt: cached.updatedAt,
    lastRemoteSyncAt: lastRemoteSyncAt ? new Date(lastRemoteSyncAt).toISOString() : null,
  });
});

// 2. Full State for Initial Load & Periodic Sync
app.get('/api/local-state', async (_req, res) => {
  const cached = await readCache();
  if (cached.barang.length > 0) {
    res.json({ ...cached, source: 'local-cache' });
    void refreshLocalCache();
    return;
  }
  await refreshLocalCache();
  const fresh = await readCache();
  res.json({ ...fresh, source: fresh.barang.length ? 'supabase' : 'empty-cache' });
});

app.get('/api/settings/min-stock', async (_req, res) => {
  const cache = await readCache();
  res.json({ success: true, settings: cache.minStockSettings });
});

app.put('/api/settings/min-stock', async (req, res) => {
  const { credentials, settings } = req.body || {};
  const defaultMinimum = settings?.defaultMinimum;
  const categoryMinimums = settings?.categoryMinimums;
  if (!Number.isInteger(defaultMinimum) || defaultMinimum < 0 || defaultMinimum > 1000000) {
    return res.status(400).json({ success: false, message: 'Batas minimum umum harus bilangan bulat antara 0 dan 1.000.000.' });
  }
  if (!categoryMinimums || typeof categoryMinimums !== 'object' || Array.isArray(categoryMinimums)) {
    return res.status(400).json({ success: false, message: 'Pengaturan batas per kategori tidak valid.' });
  }
  for (const [category, minimum] of Object.entries(categoryMinimums)) {
    if (!category.trim() || !Number.isInteger(minimum) || minimum < 0 || minimum > 1000000) {
      return res.status(400).json({ success: false, message: 'Batas setiap kategori harus bilangan bulat antara 0 dan 1.000.000.' });
    }
  }

  const cache = await readCache();
  try {
    await verifyServerAdmin(credentials, cache);
    cache.minStockSettings = normalizeMinStockSettings(settings);
    await writeCache(cache);
    res.json({ success: true, settings: cache.minStockSettings });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Gagal menyimpan pengaturan batas stok.' });
  }
});

app.put('/api/settings/opname', async (req, res) => {
  const { credentials, enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Status opname tidak valid.' });
  }
  const cache = await readCache();
  try {
    await verifyServerAdmin(credentials, cache);
    cache.opnameEnabled = enabled;
    cache.updatedAt = new Date().toISOString();
    await writeCache(cache);
    res.json({ success: true, enabled });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Gagal mengubah akses opname.' });
  }
});

app.put('/api/suppliers', async (req, res) => {
  const { credentials, suppliers } = req.body || {};
  if (!Array.isArray(suppliers)) {
    return res.status(400).json({ success: false, message: 'Daftar supplier tidak valid.' });
  }
  const normalized = suppliers.map((supplier) => ({
    kode: String(supplier?.kode || '').trim(),
    nama: String(supplier?.nama || '').trim(),
    alamat: String(supplier?.alamat || '').trim(),
    kota: String(supplier?.kota || '').trim(),
    kontak: String(supplier?.kontak || '').trim(),
    updated_at: new Date().toISOString(),
  }));
  if (normalized.some((supplier) => !supplier.kode || !supplier.nama)) {
    return res.status(400).json({ success: false, message: 'Kode dan nama supplier wajib diisi.' });
  }
  if (new Set(normalized.map((supplier) => supplier.kode.toLowerCase())).size !== normalized.length) {
    return res.status(400).json({ success: false, message: 'Kode supplier tidak boleh duplikat.' });
  }
  const cache = await readCache();
  try {
    await verifyServerAdmin(credentials, cache);
    const previousSuppliers = cache.suppliers || [];
    const nextCodes = new Set(normalized.map((supplier) => supplier.kode));
    cache.suppliers = normalized;
    cache.updatedAt = new Date().toISOString();
    await writeCache(cache);
    for (const previous of previousSuppliers) {
      if (!nextCodes.has(previous.kode)) {
        await queueOrExecute({ type: 'delete_row', table: 'suppliers', filterCol: 'kode', filterVal: previous.kode });
      }
    }
    if (normalized.length > 0) {
      await queueOrExecute({ type: 'push_rows', table: 'suppliers', rows: normalized });
    }
    res.json({ success: true, suppliers: normalized });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Gagal menyimpan supplier.' });
  }
});

app.post('/api/receipts', async (req, res) => {
  const { header, items, updatedBarangList, mutasiList } = req.body || {};
  if (!header?.nomor_faktur || !header?.supplier || !header?.tanggal || !Array.isArray(items) || items.length === 0
    || !Array.isArray(updatedBarangList) || !Array.isArray(mutasiList)) {
    return res.status(400).json({ success: false, message: 'Data faktur atau rincian barang tidak lengkap.' });
  }
  const normalizedItems = items.map((item) => ({
    ...item,
    id: isUuid(item?.id) ? item.id : randomUUID(),
    nomor_faktur: String(header.nomor_faktur).trim(),
    kodebarang: String(item?.kodebarang || '').trim().toUpperCase(),
    namabarang: String(item?.namabarang || '').trim(),
    jumlah: Number(item?.jumlah),
  }));
  if (normalizedItems.some((item) => !/^[A-Z0-9]+$/.test(item.kodebarang) || !item.namabarang || !Number.isInteger(item.jumlah) || item.jumlah <= 0)) {
    return res.status(400).json({ success: false, message: 'Kode, nama, dan jumlah pada rincian faktur harus valid.' });
  }
  if (new Set(normalizedItems.map((item) => item.kodebarang.toUpperCase())).size !== normalizedItems.length) {
    return res.status(400).json({ success: false, message: 'Kode barang pada faktur tidak boleh duplikat.' });
  }

  const normalizedHeader = {
    ...header,
    nomor_faktur: String(header.nomor_faktur).trim(),
    supplier: String(header.supplier).trim(),
    supplier_kode: String(header.supplier_kode || '').trim() || null,
    created_by: isUuid(header.created_by) ? header.created_by : null,
  };
  const normalizedBarang = updatedBarangList.map((item) => ({ ...item, kodebarang: String(item?.kodebarang || '').trim().toUpperCase() }));
  const normalizedMutasi = mutasiList.map((item) => ({ ...item, kodebarang: String(item?.kodebarang || '').trim().toUpperCase() }));
  const receiptCodes = new Set(normalizedItems.map((item) => item.kodebarang));
  if (normalizedBarang.length !== receiptCodes.size || normalizedMutasi.length !== receiptCodes.size
    || normalizedBarang.some((item) => !receiptCodes.has(item.kodebarang))
    || normalizedMutasi.some((item) => !receiptCodes.has(item.kodebarang))) {
    return res.status(400).json({ success: false, message: 'Data stok atau jurnal faktur tidak cocok dengan rincian barang.' });
  }
  const releaseReceiptLock = await acquireReceiptSaveLock(normalizedHeader.nomor_faktur);
  try {
    const cache = await readCache();
    if (cache.barangMasuk.some((receipt) => receipt.nomor_faktur === normalizedHeader.nomor_faktur)) {
      return res.status(409).json({ success: false, message: 'Nomor faktur ini sudah pernah disimpan.' });
    }
    cache.barangMasuk.unshift({ ...normalizedHeader, items: normalizedItems });
    const itemsByCode = new Map(cache.barang.map((item) => [item.kodebarang, item]));
    for (const item of normalizedBarang) itemsByCode.set(item.kodebarang, { ...itemsByCode.get(item.kodebarang), ...item });
    cache.barang = Array.from(itemsByCode.values());
    const mutationsById = new Map(cache.mutasi.map((item) => [item.id, item]));
    for (const item of normalizedMutasi) mutationsById.set(item.id, item);
    cache.mutasi = Array.from(mutationsById.values());
    cache.deleted.barangMasuk = cache.deleted.barangMasuk.filter((invoice) => invoice !== normalizedHeader.nomor_faktur);
    cache.updatedAt = new Date().toISOString();
    await writeCache(cache);
    await queueOrExecute({ type: 'push_rows', table: 'barang_masuk', rows: [normalizedHeader] });
    await queueOrExecute({ type: 'push_rows', table: 'barang_masuk_detail', rows: normalizedItems });
    await queueOrExecute({ type: 'push_rows', table: 'barang', rows: normalizedBarang });
    await queueOrExecute({ type: 'push_rows', table: 'mutasi_stok', rows: normalizedMutasi });
    res.json({ success: true, pendingQueueCount: (await readCache()).pendingQueue.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Gagal menyimpan faktur.' });
  } finally {
    releaseReceiptLock();
  }
});

app.get('/api/receipts', async (_req, res) => {
  const cache = await readCache();
  const deletedReceipts = new Set(cache.deleted.barangMasuk || []);
  res.json(cache.barangMasuk.filter((receipt) => !deletedReceipts.has(receipt.nomor_faktur)));
});

app.delete('/api/receipts/:nomorFaktur', async (req, res) => {
  const invoiceNumber = String(req.params.nomorFaktur || '').trim();
  const requestBody = req.body || {};
  const cache = await readCache();
  try {
    await verifyServerAdmin(requestBody.credentials, cache);
    const receipt = cache.barangMasuk.find((item) => item.nomor_faktur === invoiceNumber);
    if (!receipt) return res.status(404).json({ success: false, message: 'Faktur tidak ditemukan di riwayat.' });

    const updatedItems = [];
    for (const line of receipt.items || []) {
      const item = cache.barang.find((entry) => entry.kodebarang === line.kodebarang);
      if (!item) throw new Error(`Master barang ${line.kodebarang} tidak ditemukan; faktur tidak dihapus.`);
      const locationData = item.stok_lokasi && typeof item.stok_lokasi === 'object' ? item.stok_lokasi : {};
      const hasDistributedStock = Object.values(locationData).some((value) => Number(value) > 0);
      const locationStock = (location) => hasDistributedStock || Number(item.stok) === 0
        ? Number(locationData[location]) || 0
        : item.lokasi === location ? Number(item.stok) || 0 : 0;
      const stockByLocation = {
        gudang: locationStock('gudang'),
        toko: locationStock('toko'),
        reseller: locationStock('reseller'),
        online: locationStock('online'),
        cacat: locationStock('cacat'),
      };
      if (stockByLocation.gudang < Number(line.jumlah)) {
        return res.status(409).json({
          success: false,
          message: `Faktur tidak dapat dihapus: stok gudang ${line.kodebarang} tersisa ${stockByLocation.gudang}, lebih kecil dari jumlah faktur ${line.jumlah}.`,
        });
      }
      stockByLocation.gudang -= Number(line.jumlah);
      updatedItems.push({
        ...item,
        stok: Object.values(stockByLocation).reduce((total, stock) => total + stock, 0),
        stok_lokasi: stockByLocation,
        updated_at: new Date().toISOString(),
      });
    }

    await processPendingQueue();
    const cloudDelete = await queueOrExecute({
      type: 'delete_receipt',
      payload: {
        p_nomor_faktur: invoiceNumber,
        p_user_id: isUuid(requestBody.user_id) ? requestBody.user_id : null,
        p_user_name: String(requestBody.user_name || 'Admin'),
      },
    });
    if (!cloudDelete.success) {
      return res.status(409).json({ success: false, message: cloudDelete.message || 'Pembatalan faktur ditolak Supabase.' });
    }

    const latestCache = await readCache();
    const updatesByCode = new Map(updatedItems.map((item) => [item.kodebarang, item]));
    latestCache.barang = latestCache.barang.map((item) => updatesByCode.get(item.kodebarang) || item);
    latestCache.barangMasuk = latestCache.barangMasuk.filter((item) => item.nomor_faktur !== invoiceNumber);
    latestCache.deleted.barangMasuk = Array.from(new Set([...(latestCache.deleted.barangMasuk || []), invoiceNumber]));
    latestCache.updatedAt = new Date().toISOString();
    await writeCache(latestCache);
    res.json({ success: true, barang: updatedItems, queued: Boolean(cloudDelete.queued) });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message || 'Gagal menghapus faktur.' });
  }
});

app.get('/api/login-options', async (_req, res) => {
  let cache = await readCache();
  if (supabaseServiceRoleKey) {
    try {
      await flushPendingUserQueue();
      const cloudUsers = await fetchCloudUsers();
      cache = await readCache();
      cache.users = applyPendingUserChanges(cloudUsers, cache.pendingUserQueue);
      await writeCache(cache);
    } catch {
      // Use the shared server cache when Supabase is unavailable.
    }
  }

  if (cache.users.length === 0) {
    return res.status(503).json({ success: false, message: 'Daftar user belum tersedia dari cloud atau cache server.' });
  }

  const users = cache.users
    .filter((user) => user.active)
    .map(({ id, name, role }) => ({ id, name, role, active: true }));
  return res.json({ success: true, users });
});

app.post('/api/users', async (req, res) => {
  const { action, credentials, user, userId, email } = req.body || {};
  try {
    if (action === 'authenticate') {
      const result = await authenticateServerUser(credentials?.email, credentials?.password);
      const { password: _password, ...safeUser } = result.user;
      return res.json({ success: true, user: safeUser, cloudSynced: result.cloudAvailable });
    }

    let cache = await readCache();
    const admin = await verifyServerAdmin(credentials, cache);

    if (action === 'list') {
      let cloudFetched = false;
      if (supabaseServiceRoleKey) {
        try {
          await flushPendingUserQueue();
          const cloudUsers = await fetchCloudUsers();
          cache = await readCache();
          cache.users = applyPendingUserChanges(cloudUsers, cache.pendingUserQueue);
          await writeCache(cache);
          cloudFetched = true;
        } catch {
          // Return the durable server copy to LAN clients if cloud is unavailable.
        }
      }
      if (!cloudFetched && cache.users.length === 0) {
        return res.status(503).json({ success: false, message: 'Cache user server kosong dan Supabase belum dapat dihubungi.' });
      }
      return res.json({
        success: true,
        users: cache.users,
        cloudSynced: cloudFetched && cache.pendingUserQueue.length === 0,
      });
    }

    if (action === 'upsert') {
      const roles = ['admin', 'gudang', 'toko', 'reseller', 'online', 'cacat'];
      const cleanEmail = String(user?.email || '').trim().toLowerCase();
      const cleanName = String(user?.name || '').trim();
      if (!cleanEmail || !cleanName || !roles.includes(user?.role)) {
        return res.status(400).json({ success: false, message: 'Data user tidak valid.' });
      }
      const incomingId = isUuid(user.id) ? user.id : undefined;
      const existingById = incomingId && cache.users.find((existing) => existing.id === incomingId);
      const existingByEmail = cache.users.find((existing) => existing.email.toLowerCase() === cleanEmail);
      if (existingByEmail && incomingId && existingByEmail.id !== incomingId && !existingById) {
        return res.status(409).json({ success: false, message: 'Email tersebut sudah digunakan user lain.' });
      }
      const existing = existingById || existingByEmail;
      const row = {
        id: existing?.id || incomingId || randomUUID(),
        email: cleanEmail,
        name: cleanName,
        role: user.role,
        active: user.active !== false,
        avatar: user.avatar || null,
        signature: user.signature || null,
        password: String(user.password || (user.role === 'admin' ? 'admin123' : '123456')),
        created_at: existing?.created_at || user.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      cacheUser(cache, row);
      const change = { action: 'upsert', user: row };
      queueUserChange(cache, change);
      await writeCache(cache);

      let cloudSynced = false;
      let cloudError = '';
      try {
        const response = await usersAdminFetch('users?on_conflict=id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(row),
        });
        const [savedUser] = await response.json();
        cache = await readCache();
        cacheUser(cache, savedUser || row);
        clearQueuedUserChange(cache, row.id, row.email);
        await writeCache(cache);
        cloudSynced = true;
      } catch (error) {
        cloudError = error.message;
      }
      return res.json({
        success: true,
        user: row,
        cloudSynced,
        message: cloudSynced ? 'User tersimpan di server dan cloud.' : `User tersimpan di server LAN; sinkronisasi cloud tertunda: ${cloudError}`,
      });
    }

    if (action === 'delete') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (cleanEmail && cleanEmail === admin.email.toLowerCase()) {
        return res.status(400).json({ success: false, message: 'Akun Admin yang sedang digunakan tidak dapat dihapus.' });
      }
      if (!cleanEmail && !isUuid(userId)) {
        return res.status(400).json({ success: false, message: 'Identitas user untuk dihapus tidak valid.' });
      }
      const target = cache.users.find((existing) =>
        (isUuid(userId) && existing.id === userId) || existing.email.toLowerCase() === cleanEmail,
      );
      const targetId = target?.id || userId;
      const targetEmail = target?.email || cleanEmail;
      cache.users = cache.users.filter((existing) =>
        existing.id !== targetId && existing.email.toLowerCase() !== targetEmail,
      );
      const change = { action: 'delete', userId: targetId, email: targetEmail };
      queueUserChange(cache, change);
      await writeCache(cache);

      let cloudSynced = false;
      let cloudError = '';
      try {
        await pushUserChange(change);
        cache = await readCache();
        clearQueuedUserChange(cache, targetId, targetEmail);
        await writeCache(cache);
        cloudSynced = true;
      } catch (error) {
        cloudError = error.message;
      }
      return res.json({
        success: true,
        cloudSynced,
        message: cloudSynced ? 'User dihapus dari server dan cloud.' : `User dihapus dari server LAN; sinkronisasi cloud tertunda: ${cloudError}`,
      });
    }

    return res.status(400).json({ success: false, message: 'Aksi user tidak dikenal.' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// 3. ATOMIC CRUD ENDPOINT (Guaranteed safe for LAN clients without internet)
app.post('/api/sync/crud', async (req, res) => {
  const { action, payload } = req.body || {};
  if (!action) {
    return res.status(400).json({ success: false, message: 'Action diperlukan' });
  }

  const cached = await readCache();
  cached.deleted = cached.deleted || { barang: [], mutasi: [], opname: [], penjualan: [], permintaanMutasi: [] };

  try {
    switch (action) {

      case 'create_barang': {
        const { item, mutasi } = payload;
        if (!item?.kodebarang) throw new Error('Kode barang wajib diisi');
        const normalizedCode = String(item.kodebarang).trim().toUpperCase();
        if (!/^[A-Z0-9]+$/.test(normalizedCode)) throw new Error('Kode barang hanya boleh berisi huruf dan angka.');
        item.kodebarang = normalizedCode;
        if (mutasi) mutasi.kodebarang = normalizedCode;

        // Unset from deleted tombstone if previously deleted
        cached.deleted.barang = (cached.deleted.barang || []).filter((k) => k !== item.kodebarang);

        // Update local cache
        const existingIdx = cached.barang.findIndex((b) => b.kodebarang === item.kodebarang);
        if (existingIdx !== -1) {
          cached.barang[existingIdx] = { ...cached.barang[existingIdx], ...item };
        } else {
          cached.barang.unshift(item);
        }
        if (mutasi) {
          cached.mutasi.unshift(mutasi);
        }
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        // Push to Supabase Cloud
        void queueOrExecute({ type: 'push_rows', table: 'barang', rows: [item] });
        if (mutasi) {
          void queueOrExecute({ type: 'push_rows', table: 'mutasi_stok', rows: [mutasi] });
        }
        break;
      }

      case 'update_barang': {
        const { kodebarang, updates, mutasi } = payload;
        const idx = cached.barang.findIndex((b) => b.kodebarang === kodebarang);
        if (idx !== -1) {
          cached.barang[idx] = { ...cached.barang[idx], ...updates, updated_at: new Date().toISOString() };
        }
        if (mutasi) {
          cached.mutasi.unshift(mutasi);
        }
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        // Push to Cloud
        void queueOrExecute({ type: 'update_row', table: 'barang', filterCol: 'kodebarang', filterVal: kodebarang, updates });
        if (mutasi) {
          void queueOrExecute({ type: 'push_rows', table: 'mutasi_stok', rows: [mutasi] });
        }
        break;
      }

      case 'delete_barang': {
        const { kodebarang } = payload;
        cached.barang = cached.barang.filter((b) => b.kodebarang !== kodebarang);
        cached.deleted.barang = Array.from(new Set([...(cached.deleted.barang || []), kodebarang]));
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        // Delete from Cloud
        void queueOrExecute({ type: 'delete_row', table: 'barang', filterCol: 'kodebarang', filterVal: kodebarang });
        break;
      }

      case 'record_penjualan': {
        const { items, salesList, mutasiList, updatedBarangList } = payload;
        if (Array.isArray(updatedBarangList) && updatedBarangList.length > 0) {
          const updateMap = new Map(updatedBarangList.map((b) => [b.kodebarang, b]));
          cached.barang = cached.barang.map((b) => updateMap.get(b.kodebarang) || b);
        }
        if (Array.isArray(salesList) && salesList.length > 0) {
          const salesByKey = new Map(cached.penjualan.map((sale) => [
            sale.transaction_id ? `${sale.transaction_id}:${sale.kodebarang}` : sale.id,
            sale,
          ]));
          for (const sale of salesList) {
            const key = sale.transaction_id ? `${sale.transaction_id}:${sale.kodebarang}` : sale.id;
            salesByKey.set(key, { ...salesByKey.get(key), ...sale });
          }
          cached.penjualan = Array.from(salesByKey.values());
        }
        if (Array.isArray(mutasiList) && mutasiList.length > 0) {
          cached.mutasi = [...mutasiList, ...cached.mutasi];
        }
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        // Push updates to Supabase
        if (updatedBarangList?.length) {
          void queueOrExecute({ type: 'push_rows', table: 'barang', rows: updatedBarangList });
        }
        if (salesList?.length) {
          void queueOrExecute({ type: 'push_rows', table: 'penjualan_history', rows: salesList });
        }
        if (mutasiList?.length) {
          void queueOrExecute({ type: 'push_rows', table: 'mutasi_stok', rows: mutasiList });
        }
        break;
      }

      case 'delete_penjualan': {
        const { saleId, credentials, reversalMutation } = payload || {};
        const releaseSaleDeleteLock = await acquireSaleDeleteLock(saleId);
        try {
        const saleCache = await readCache();
        saleCache.deleted = saleCache.deleted || { barang: [], mutasi: [], opname: [], penjualan: [], permintaanMutasi: [] };
        await verifyServerAdmin(credentials, saleCache);
        const sale = saleCache.penjualan.find((entry) => entry.id === saleId);
        if (!sale) {
          res.json({ success: true, action, alreadyDeleted: true, pendingQueueCount: saleCache.pendingQueue?.length || 0 });
          return;
        }

        const barangIndex = saleCache.barang.findIndex((item) => item.kodebarang === sale.kodebarang);
        if (barangIndex < 0) throw new Error('Master barang transaksi tidak ditemukan; stok tidak diubah.');
        const barang = saleCache.barang[barangIndex];
        const location = ['toko', 'reseller', 'online', 'cacat'].includes(sale.lokasi) ? sale.lokasi : 'toko';
        const stockLocations = {
          gudang: Number(barang.stok_lokasi?.gudang) || 0,
          toko: Number(barang.stok_lokasi?.toko) || 0,
          reseller: Number(barang.stok_lokasi?.reseller) || 0,
          online: Number(barang.stok_lokasi?.online) || 0,
          cacat: Number(barang.stok_lokasi?.cacat) || 0,
        };
        stockLocations[location] += Number(sale.jumlah_terjual) || 0;
        const updatedBarang = {
          ...barang,
          stok_lokasi: stockLocations,
          stok: Object.values(stockLocations).reduce((total, quantity) => total + quantity, 0),
          updated_at: new Date().toISOString(),
        };
        const reversal = {
          ...reversalMutation,
          kodebarang: sale.kodebarang,
          namabarang: sale.namabarang,
          stok_sebelum: barang.stok,
          stok_sesudah: updatedBarang.stok,
          perubahan: Number(sale.jumlah_terjual) || 0,
          keterangan: `Pembatalan transaksi ${sale.transaction_id || sale.id}; stok ${location} dikembalikan oleh Admin.`,
          created_at: new Date().toISOString(),
        };

        saleCache.barang[barangIndex] = updatedBarang;
        saleCache.penjualan = saleCache.penjualan.filter((entry) => entry.id !== saleId);
        saleCache.mutasi.unshift(reversal);
        saleCache.deleted.penjualan = Array.from(new Set([...(saleCache.deleted.penjualan || []), saleId]));
        saleCache.updatedAt = new Date().toISOString();
        await writeCache(saleCache);

        void queueOrExecute({ type: 'push_rows', table: 'barang', rows: [updatedBarang] });
        void queueOrExecute({ type: 'push_rows', table: 'mutasi_stok', rows: [reversal] });
        void queueOrExecute({ type: 'delete_row', table: 'penjualan_history', filterCol: 'id', filterVal: saleId });
        break;
        } finally {
          releaseSaleDeleteLock();
        }
      }

      case 'record_opname': {
        const { opname, updatedBarangList, mutasiList } = payload;
        if (Array.isArray(updatedBarangList) && updatedBarangList.length > 0) {
          const updateMap = new Map(updatedBarangList.map((b) => [b.kodebarang, b]));
          cached.barang = cached.barang.map((b) => updateMap.get(b.kodebarang) || b);
        }
        if (opname) {
          cached.opname.unshift(opname);
        }
        if (Array.isArray(mutasiList) && mutasiList.length > 0) {
          cached.mutasi = [...mutasiList, ...cached.mutasi];
        }
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        if (updatedBarangList?.length) {
          void queueOrExecute({ type: 'push_rows', table: 'barang', rows: updatedBarangList });
        }
        if (opname) {
          void queueOrExecute({ type: 'push_rows', table: 'opname_history', rows: [opname] });
        }
        if (mutasiList?.length) {
          void queueOrExecute({ type: 'push_rows', table: 'mutasi_stok', rows: mutasiList });
        }
        break;
      }

      case 'create_permintaan_mutasi': {
        const { items } = payload;
        if (Array.isArray(items) && items.length > 0) {
          cached.permintaanMutasi = mergeMutationRequests(cached.permintaanMutasi, items);
          cached.updatedAt = new Date().toISOString();
          await writeCache(cached);
          void queueOrExecute({ type: 'push_rows', table: 'permintaan_mutasi', rows: items });
        }
        break;
      }

      case 'create_retur_stok': {
        const { items } = payload;
        if (Array.isArray(items) && items.length > 0) {
          cached.returStok = mergeRecords(cached.returStok, items);
          cached.updatedAt = new Date().toISOString();
          await writeCache(cached);
          void queueOrExecute({ type: 'push_rows', table: 'retur_stok', rows: items });
        }
        break;
      }

      case 'process_retur_stok': {
        const { request, updatedBarang, mutasi } = payload;
        if (!request?.id || !updatedBarang?.kodebarang || !mutasi?.id) {
          return res.status(400).json({ success: false, message: 'Hasil proses retur tidak lengkap.' });
        }

        const requestIndex = cached.returStok.findIndex((entry) => entry.id === request.id);
        if (requestIndex >= 0) cached.returStok[requestIndex] = request;
        else cached.returStok.unshift(request);

        const barangIndex = cached.barang.findIndex((entry) => entry.kodebarang === updatedBarang.kodebarang);
        if (barangIndex >= 0) cached.barang[barangIndex] = updatedBarang;
        else cached.barang.unshift(updatedBarang);

        const mutasiIndex = cached.mutasi.findIndex((entry) => entry.id === mutasi.id);
        if (mutasiIndex >= 0) cached.mutasi[mutasiIndex] = mutasi;
        else cached.mutasi.unshift(mutasi);

        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);
        break;
      }

      case 'approve_permintaan_mutasi': {
        const { requestId, updatedRequest, mutasi, updatedBarang } = payload;
        cached.permintaanMutasi = cached.permintaanMutasi.map((r) =>
          r.id === requestId ? { ...r, ...updatedRequest } : r
        );
        if (updatedBarang) {
          const idx = cached.barang.findIndex((b) => b.kodebarang === updatedBarang.kodebarang);
          if (idx !== -1) cached.barang[idx] = updatedBarang;
        }
        if (mutasi) {
          cached.mutasi.unshift(mutasi);
        }
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        void queueOrExecute({
          type: 'update_row',
          table: 'permintaan_mutasi',
          filterCol: 'id',
          filterVal: requestId,
          updates: updatedRequest,
        });
        if (updatedBarang) {
          void queueOrExecute({ type: 'push_rows', table: 'barang', rows: [updatedBarang] });
        }
        if (mutasi) {
          void queueOrExecute({ type: 'push_rows', table: 'mutasi_stok', rows: [mutasi] });
        }
        break;
      }

      case 'reject_permintaan_mutasi': {
        const { requestId, updatedRequest } = payload;
        cached.permintaanMutasi = cached.permintaanMutasi.map((r) =>
          r.id === requestId ? { ...r, ...updatedRequest } : r
        );
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        void queueOrExecute({
          type: 'update_row',
          table: 'permintaan_mutasi',
          filterCol: 'id',
          filterVal: requestId,
          updates: updatedRequest,
        });
        break;
      }

      case 'update_permintaan_mutasi': {
        const { requestId, updates } = payload;
        cached.permintaanMutasi = cached.permintaanMutasi.map((r) =>
          r.id === requestId ? { ...r, ...updates, updated_at: new Date().toISOString() } : r
        );
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        void queueOrExecute({
          type: 'update_row',
          table: 'permintaan_mutasi',
          filterCol: 'id',
          filterVal: requestId,
          updates,
        });
        break;
      }

      case 'delete_permintaan_mutasi': {
        const { requestId } = payload;
        cached.permintaanMutasi = cached.permintaanMutasi.filter((r) => r.id !== requestId);
        cached.deleted.permintaanMutasi = Array.from(
          new Set([...(cached.deleted.permintaanMutasi || []), requestId])
        );
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        void queueOrExecute({
          type: 'delete_row',
          table: 'permintaan_mutasi',
          filterCol: 'id',
          filterVal: requestId,
        });
        break;
      }

      case 'clear_all_data': {
        cached.barang = [];
        cached.mutasi = [];
        cached.opname = [];
        cached.penjualan = [];
        cached.permintaanMutasi = [];
        cached.returStok = [];
        cached.pendingQueue = [];
        cached.updatedAt = new Date().toISOString();
        await writeCache(cached);

        try {
          await clearRemoteData();
        } catch (error) {
          console.warn('Clear remote cloud warning:', error.message);
          cached.pendingQueue = [{ type: 'clear_remote_data' }];
          await writeCache(cached);
        }
        break;
      }

      default:
        return res.status(400).json({ success: false, message: `Aksi ${action} tidak dikenal` });
    }

    res.json({
      success: true,
      action,
      updatedAt: cached.updatedAt,
      isSupabaseReachable,
      pendingQueueCount: cached.pendingQueue?.length || 0,
    });
  } catch (err) {
    console.error(`[API CRUD Error] action ${action}:`, err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Backward compatibility legacy endpoint
app.post('/api/local-state', async (req, res) => {
  const cached = await readCache();
  const incoming = req.body || {};
  const state = {
    ...cached,
    barang: incoming.barang?.length ? mergeRecords(cached.barang, incoming.barang) : cached.barang,
    mutasi: mergeRecords(cached.mutasi, Array.isArray(incoming.mutasi) ? incoming.mutasi : []),
    opname: mergeRecords(cached.opname, Array.isArray(incoming.opname) ? incoming.opname : []),
    penjualan: mergeRecords(cached.penjualan, Array.isArray(incoming.penjualan) ? incoming.penjualan : []),
    permintaanMutasi: mergeMutationRequests(cached.permintaanMutasi, Array.isArray(incoming.permintaanMutasi) ? incoming.permintaanMutasi : []),
    returStok: mergeRecords(cached.returStok, Array.isArray(incoming.returStok) ? incoming.returStok : []),
    suppliers: Array.isArray(incoming.suppliers) ? incoming.suppliers : cached.suppliers,
    opnameEnabled: typeof incoming.opnameEnabled === 'boolean' ? incoming.opnameEnabled : cached.opnameEnabled,
    updatedAt: new Date().toISOString(),
    source: 'local-cache',
  };
  await writeCache(state);
  res.json(state);
});

app.delete('/api/local-state/:collection/:id', async (req, res) => {
  const allowed = new Set(['barang', 'mutasi', 'opname', 'penjualan', 'permintaanMutasi']);
  const { collection, id } = req.params;
  if (!allowed.has(collection)) return res.status(400).json({ error: 'Koleksi tidak valid' });

  const cached = await readCache();
  cached.deleted = cached.deleted || { barang: [], mutasi: [], opname: [], penjualan: [], permintaanMutasi: [] };
  cached.deleted[collection] = Array.from(new Set([...(cached.deleted[collection] || []), id]));

  if (collection === 'barang') {
    cached.barang = cached.barang.filter((item) => item.kodebarang !== id);
    void queueOrExecute({ type: 'delete_row', table: 'barang', filterCol: 'kodebarang', filterVal: id });
  } else {
    cached[collection] = (cached[collection] || []).filter((item) => item.id !== id && item.nomor_permintaan !== id);
    const tableName =
      collection === 'permintaanMutasi'
        ? 'permintaan_mutasi'
        : collection === 'mutasi'
        ? 'mutasi_stok'
        : collection === 'opname'
        ? 'opname_history'
        : 'penjualan_history';
    void queueOrExecute({ type: 'delete_row', table: tableName, filterCol: 'id', filterVal: id });
  }

  cached.updatedAt = new Date().toISOString();
  await writeCache(cached);
  res.json({ success: true });
});

// Periodic background sync runner (every 25 seconds)
setInterval(() => {
  void refreshLocalCache();
}, 25000);

// Static assets & SPA fallback
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  if (path.extname(req.path)) {
    res.status(404).type('text/plain').send('Asset tidak ditemukan');
    return;
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`Server LAN & Cloud Proxy berjalan di http://0.0.0.0:${port}`);
  console.log(`Port: ${port} | Database: Supabase Cloud & Cache Lokal`);
  console.log(`========================================================`);
});
