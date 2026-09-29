import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Barang, GoodsReceipt, GoodsReceiptLine, MinimumStockSettings, MutasiStok, OpnameHistory, PenjualanHistory, StockLocation, SalesStockLocation, PermintaanMutasi, ReturStok, UserRole, MutationRequestLine, Supplier, getCashierSalesLocation } from '../types';
import { INITIAL_BARANG, INITIAL_MUTASI, INITIAL_OPNAME_HISTORY, INITIAL_PENJUALAN, INITIAL_PERMINTAAN_MUTASI } from '../lib/constants';
import { supabase, testSupabaseConnection, STORAGE_KEYS } from '../lib/supabase';
import { sound } from '../lib/sound';
import { useAuth } from './AuthContext';
import { fetchLocalState, publishLocalState, deleteLocalRecord, syncCrudToServer, fetchSyncStatus, saveMinimumStockSettings as saveMinimumStockSettingsToServer, saveOpnameEnabled as saveOpnameEnabledToServer, saveSuppliers as saveSuppliersToServer, saveGoodsReceipt as saveGoodsReceiptToServer, deleteGoodsReceipt as deleteGoodsReceiptFromServer } from '../lib/localServer';
import { idbGet, idbSet, idbClear } from '../lib/idbStorage';
import { DEFAULT_MINIMUM_STOCK_SETTINGS } from '../lib/minStock';
import { isValidItemCode, normalizeItemCode } from '../lib/itemCode';

export function getItemLocationStock(item: Barang, location: StockLocation): number {
  const locationData = item.stok_lokasi && typeof item.stok_lokasi === 'object' ? item.stok_lokasi : undefined;
  const locationValues = locationData ? Object.values(locationData) : [];
  const hasDistributedStock = locationValues.some((value) => Number(value) > 0);
  const primaryStock = Number(item.stok) || 0;

  // Existing master data may have a default all-zero stok_lokasi column.
  // Until the first real location distribution is saved, use the legacy stok field.
  if (locationData && (hasDistributedStock || primaryStock === 0)) {
    return Number(locationData[location]) || 0;
  }
  const primaryLoc = String(item.lokasi || 'gudang');
  return primaryLoc === location ? primaryStock : 0;
}

export function getTotalConsolidatedStock(item: Barang): number {
  if (item.stok_lokasi && typeof item.stok_lokasi === 'object') {
    const distributedTotal = (
      (Number(item.stok_lokasi.gudang) || 0) +
      (Number(item.stok_lokasi.toko) || 0) +
      (Number(item.stok_lokasi.reseller) || 0) +
      (Number(item.stok_lokasi.online) || 0) +
      (Number(item.stok_lokasi.cacat) || 0)
    );
    if (distributedTotal > 0 || Number(item.stok) === 0) return distributedTotal;
  }
  return Number(item.stok) || 0;
}

export function countUniqueMutationRequests(requests: PermintaanMutasi[]): number {
  return new Set(requests.map((request) => request.nomor_permintaan || request.id)).size;
}

interface InventoryContextType {
  barangList: Barang[];
  mutasiList: MutasiStok[];
  opnameHistoryList: OpnameHistory[];
  penjualanList: PenjualanHistory[];
  permintaanMutasiList: PermintaanMutasi[];
  returStokList: ReturStok[];
  minStockSettings: MinimumStockSettings;
  saveMinimumStockSettings: (settings: MinimumStockSettings) => Promise<{ success: boolean; message?: string }>;
  suppliers: Supplier[];
  barangMasukList: GoodsReceipt[];
  saveSuppliers: (suppliers: Supplier[]) => Promise<{ success: boolean; message?: string }>;
  opnameEnabled: boolean;
  setOpnameEnabled: (enabled: boolean) => Promise<{ success: boolean; message?: string }>;
  pendingApprovalCount: number;
  isLoading: boolean;
  isDbConnected: boolean;
  dbStatusMsg: string;
  syncProgress: { total: number; loaded: number; isSyncing: boolean };
  refreshData: () => Promise<void>;
  searchBarangServer: (query: string) => Promise<Barang[]>;
  addBarang: (item: Omit<Barang, 'updated_at'>) => Promise<boolean>;
  receiveGoods: (receipt: {
    nomor_faktur: string;
    supplier: string;
    supplier_kode?: string;
    tanggal: string;
    catatan?: string;
    items: { kodebarang: string; jumlah: number; barangBaru?: Omit<Barang, 'updated_at'> }[];
  }) => Promise<boolean>;
  deleteGoodsReceipt: (nomorFaktur: string) => Promise<{ success: boolean; message: string; queued?: boolean }>;
  updateBarang: (kodebarang: string, updates: Partial<Barang>) => Promise<boolean>;
  deleteBarang: (kodebarang: string) => Promise<boolean>;
  clearAllMasterData: () => Promise<boolean>;
  processOpname: (
    items: { kodebarang: string; stok_fisik: number }[],
    fileName: string,
    location?: StockLocation
  ) => Promise<{ success: boolean; totalProses: number; totalSelisih: number }>;
  processKasirPenjualan: (
    items: { kodebarang: string; jumlah_terjual: number }[],
    keterangan?: string
  ) => Promise<{ success: boolean; totalItems: number; totalNominal: number; message: string }>;
  deleteSalesRecord: (saleId: string) => Promise<{ success: boolean; message: string }>;
  createPermintaanMutasi: (params: {
    kodebarang: string;
    asal_lokasi: StockLocation;
    tujuan_lokasi: StockLocation;
    jumlah_diminta: number;
    alasan?: string;
  }) => Promise<{ success: boolean; message: string; data?: PermintaanMutasi }>;
  createPermintaanMutasiBatch: (params: {
    items: MutationRequestLine[];
    asal_lokasi: StockLocation;
    tujuan_lokasi: StockLocation;
    alasan?: string;
  }) => Promise<{ success: boolean; message: string; data?: PermintaanMutasi[] }>;
  createReturStok: (params: {
    kodebarang: string;
    asal_lokasi: StockLocation;
    tujuan_lokasi: StockLocation | null;
    supplier: string | null;
    jumlah: number;
    alasan?: string;
  }) => Promise<{ success: boolean; message: string; data?: ReturStok }>;
  processReturStok: (requestId: string) => Promise<{ success: boolean; message: string }>;
  approvePermintaanMutasi: (
    requestId: string,
    catatanApproval?: string
  ) => Promise<{ success: boolean; message: string }>;
  rejectPermintaanMutasi: (
    requestId: string,
    alasanPenolakan: string
  ) => Promise<{ success: boolean; message: string }>;
  updatePermintaanMutasi: (requestId: string, updates: Partial<PermintaanMutasi>) => Promise<boolean>;
  deletePermintaanMutasi: (requestId: string) => Promise<boolean>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

function createMutationRequestNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const uniquePart = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`.toUpperCase();
  return `REQ-${dateStr}-${uniquePart}`;
}

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [dbStatusMsg, setDbStatusMsg] = useState('Memeriksa koneksi Supabase...');
  const [syncProgress, setSyncProgress] = useState<{ total: number; loaded: number; isSyncing: boolean }>({
    total: 0,
    loaded: 0,
    isSyncing: false,
  });

  // State
  const [barangList, setBarangList] = useState<Barang[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BARANG);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_BARANG;
  });

  const [mutasiList, setMutasiList] = useState<MutasiStok[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MUTASI);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_MUTASI;
  });

  const [opnameHistoryList, setOpnameHistoryList] = useState<OpnameHistory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.OPNAME);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_OPNAME_HISTORY;
  });

  const [penjualanList, setPenjualanList] = useState<PenjualanHistory[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PENJUALAN);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_PENJUALAN;
  });

  const [permintaanMutasiList, setPermintaanMutasiList] = useState<PermintaanMutasi[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PERMINTAAN_MUTASI);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_PERMINTAAN_MUTASI;
  });
  const [returStokList, setReturStokList] = useState<ReturStok[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.RETUR_STOK);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [minStockSettings, setMinStockSettings] = useState<MinimumStockSettings>(() => {
    try {
      const saved = localStorage.getItem('pantau_min_stock_settings');
      if (saved) return { ...DEFAULT_MINIMUM_STOCK_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_MINIMUM_STOCK_SETTINGS;
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = localStorage.getItem('pantau_suppliers');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });
  const [barangMasukList, setBarangMasukList] = useState<GoodsReceipt[]>([]);
  const [opnameEnabled, setOpnameEnabledState] = useState(() => {
    try {
      return localStorage.getItem('pantau_opname_enabled') !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pantau_min_stock_settings', JSON.stringify(minStockSettings));
    } catch {
      // ignore
    }
  }, [minStockSettings]);

  useEffect(() => {
    try {
      localStorage.setItem('pantau_suppliers', JSON.stringify(suppliers));
      localStorage.setItem('pantau_opname_enabled', String(opnameEnabled));
    } catch {
      // ignore
    }
  }, [suppliers, opnameEnabled]);

  // Calculate pending approvals for currently logged in user
  const pendingApprovalCount = useMemo(() => {
    return countUniqueMutationRequests(permintaanMutasiList.filter((req) => {
      if (req.status !== 'pending') return false;
      if (currentUser.role === 'admin') return true;
      return req.asal_lokasi === currentUser.role;
    }));
  }, [permintaanMutasiList, currentUser.role]);

  // Keep the full catalog available for the LAN publisher; the server is the durable cache.
  // We also save to IndexedDB so 20,000+ items never overflow the browser's 5MB localStorage limit.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.BARANG, JSON.stringify(barangList.slice(0, 1000)));
    } catch {
      // ignore
    }
    void idbSet(STORAGE_KEYS.BARANG, barangList);
  }, [barangList]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MUTASI, JSON.stringify(mutasiList.slice(0, 500)));
    } catch {
      // ignore
    }
    void idbSet(STORAGE_KEYS.MUTASI, mutasiList);
  }, [mutasiList]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.OPNAME, JSON.stringify(opnameHistoryList));
    } catch {
      // ignore
    }
    void idbSet(STORAGE_KEYS.OPNAME, opnameHistoryList);
  }, [opnameHistoryList]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PENJUALAN, JSON.stringify(penjualanList.slice(0, 500)));
    } catch {
      // ignore
    }
    void idbSet(STORAGE_KEYS.PENJUALAN, penjualanList);
  }, [penjualanList]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PERMINTAAN_MUTASI, JSON.stringify(permintaanMutasiList));
    } catch {
      // ignore
    }
    void idbSet(STORAGE_KEYS.PERMINTAAN_MUTASI, permintaanMutasiList);
  }, [permintaanMutasiList]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.RETUR_STOK, JSON.stringify(returStokList));
    } catch {
      // ignore
    }
    void idbSet(STORAGE_KEYS.RETUR_STOK, returStokList);
  }, [returStokList]);

  // Initial load from IndexedDB if localStorage was empty or truncated
  useEffect(() => {
    (async () => {
      try {
        const idbBarang = await idbGet<Barang[]>(STORAGE_KEYS.BARANG);
        if (idbBarang && Array.isArray(idbBarang) && idbBarang.length > barangList.length) {
          setBarangList(idbBarang);
        }
        const idbMutasi = await idbGet<MutasiStok[]>(STORAGE_KEYS.MUTASI);
        if (idbMutasi && Array.isArray(idbMutasi) && idbMutasi.length > mutasiList.length) {
          setMutasiList(idbMutasi);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Auto-sync polling: periodically checks LAN server state every 15s to keep all LAN PCs in sync
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const state = await fetchLocalState();
        if (state && Array.isArray(state.barang)) {
          if (state.barang.length > 0) setBarangList(state.barang);
          if (state.mutasi) setMutasiList(state.mutasi);
          if (state.opname) setOpnameHistoryList(state.opname);
          if (state.penjualan) setPenjualanList(state.penjualan);
          if (state.permintaanMutasi) setPermintaanMutasiList(state.permintaanMutasi);
          if (state.returStok) setReturStokList(state.returStok);
          if (state.minStockSettings) setMinStockSettings(state.minStockSettings);
          if (state.suppliers) setSuppliers(state.suppliers);
          if (state.barangMasuk) setBarangMasukList(state.barangMasuk);
          if (typeof state.opnameEnabled === 'boolean') setOpnameEnabledState(state.opnameEnabled);
        }
      } catch {
        // ignore background poll error
      }
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch data from Server or Supabase if tables are online with chunked pagination for 20,000+ items
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [localState, syncStatus] = await Promise.all([
        fetchLocalState(),
        fetchSyncStatus(),
      ]);

      if (localState) {
        if (localState.barang.length > 0) setBarangList(localState.barang);
        if (localState.mutasi.length > 0 || currentUser.role !== 'admin') setMutasiList(localState.mutasi);
        if (localState.opname.length > 0 || currentUser.role !== 'admin') setOpnameHistoryList(localState.opname);
        if (localState.penjualan.length > 0 || currentUser.role !== 'admin') setPenjualanList(localState.penjualan);
        if (localState.permintaanMutasi.length > 0 || currentUser.role !== 'admin') setPermintaanMutasiList(localState.permintaanMutasi);
        if (localState.returStok) setReturStokList(localState.returStok);
        if (localState.minStockSettings) setMinStockSettings(localState.minStockSettings);
        if (localState.suppliers) setSuppliers(localState.suppliers);
        if (localState.barangMasuk) setBarangMasukList(localState.barangMasuk);
        if (typeof localState.opnameEnabled === 'boolean') setOpnameEnabledState(localState.opnameEnabled);
        
        setIsDbConnected(true);
        if (syncStatus?.isSupabaseReachable) {
          setDbStatusMsg(
            syncStatus.pendingQueueCount > 0
              ? `Server LAN Aktif (Cloud Sync: ${syncStatus.pendingQueueCount} antrean)`
              : `Server LAN Aktif & Supabase Cloud Terhubung (${localState.barang.length} barang)`
          );
        } else {
          setDbStatusMsg(
            localState.source === 'empty-cache'
              ? 'Server lokal terhubung, cache data barang masih kosong'
              : `Server LAN Aktif (Data tersimpan aman di server)`
          );
        }
        setSyncProgress({ total: localState.barang.length, loaded: localState.barang.length, isSyncing: false });
        return;
      }

      const conn = await testSupabaseConnection();
      setIsDbConnected(conn.connected);
      setDbStatusMsg(conn.message);

      if (conn.connected) {
        // 1. Get exact total count of barang in Supabase
        const { count, error: countErr } = await supabase
          .from('barang')
          .select('*', { count: 'exact', head: true });

        const totalItemsInDb = count || 0;
        const PAGE_SIZE = 1000;

        setSyncProgress({
          total: totalItemsInDb,
          loaded: 0,
          isSyncing: true,
        });

        // 2. Fetch first chunk (0 - 999) immediately for instantaneous initial render
        const { data: firstChunk } = await supabase
          .from('barang')
          .select('*')
          .order('kodebarang', { ascending: true })
          .range(0, PAGE_SIZE - 1);

        let accumulated: Barang[] = [];
        if (firstChunk && firstChunk.length > 0) {
          accumulated = [...(firstChunk as Barang[])];
          setBarangList(accumulated);
          setSyncProgress((prev) => ({ ...prev, loaded: accumulated.length }));
        }

        // 3. If there are more than 1,000 items (e.g. 20,000 items), fetch remaining ranges in parallel batches
        if (totalItemsInDb > PAGE_SIZE) {
          const totalPages = Math.ceil(totalItemsInDb / PAGE_SIZE);
          const ranges: [number, number][] = [];
          for (let p = 1; p < totalPages; p++) {
            ranges.push([p * PAGE_SIZE, Math.min((p + 1) * PAGE_SIZE - 1, totalItemsInDb - 1)]);
          }

          // Concurrency of 4 requests at a time for optimal speed and reliability
          for (let b = 0; b < ranges.length; b += 4) {
            const batch = ranges.slice(b, b + 4);
            const batchResults = await Promise.all(
              batch.map(([from, to]) =>
                supabase
                  .from('barang')
                  .select('*')
                  .order('kodebarang', { ascending: true })
                  .range(from, to)
              )
            );

            for (const res of batchResults) {
              if (res.data && res.data.length > 0) {
                accumulated.push(...(res.data as Barang[]));
              }
            }

            setBarangList([...accumulated]);
            setSyncProgress({
              total: totalItemsInDb,
              loaded: accumulated.length,
              isSyncing: true,
            });
          }
        }

        setSyncProgress({
          total: totalItemsInDb,
          loaded: accumulated.length > 0 ? accumulated.length : totalItemsInDb,
          isSyncing: false,
        });

        // Load mutasi
        const { data: dbMutasi } = await supabase
          .from('mutasi_stok')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (dbMutasi && dbMutasi.length > 0) {
          setMutasiList(dbMutasi as MutasiStok[]);
        }

        // Load opname history
        const { data: dbOpname } = await supabase
          .from('opname_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        if (dbOpname && dbOpname.length > 0) {
          setOpnameHistoryList(dbOpname as OpnameHistory[]);
        }

        // Load penjualan history
        const { data: dbPenjualan } = await supabase
          .from('penjualan_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (dbPenjualan && dbPenjualan.length > 0) {
          setPenjualanList(dbPenjualan as PenjualanHistory[]);
        }

        // Load permintaan mutasi
        const { data: dbReqs } = await supabase
          .from('permintaan_mutasi')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (dbReqs && dbReqs.length > 0) {
          setPermintaanMutasiList(dbReqs as PermintaanMutasi[]);
        }

        const { data: dbReturStok } = await supabase
          .from('retur_stok')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        if (dbReturStok) setReturStokList(dbReturStok as ReturStok[]);
      }
    } catch (err) {
      console.warn('Sync notice:', err);
    } finally {
      setIsLoading(false);
      setSyncProgress((prev) => ({ ...prev, isSyncing: false }));
    }
  }, []);

  // Search every matching row on Supabase, independent of the locally loaded page.
  const searchBarangServer = useCallback(async (query: string): Promise<Barang[]> => {
    const q = query.trim();
    if (!q) return [];
    try {
      const searchFilter = `kodebarang.ilike.%${q}%,namabarang.ilike.%${q}%,kodebarcode.ilike.%${q}%,jenis.ilike.%${q}%,merek.ilike.%${q}%`;
      const { count, error: countError } = await supabase
        .from('barang')
        .select('*', { count: 'exact', head: true })
        .or(searchFilter);

      if (countError) throw countError;

      const totalMatches = count || 0;
      const PAGE_SIZE = 1000;
      const ranges: [number, number][] = [];
      for (let from = 0; from < totalMatches; from += PAGE_SIZE) {
        ranges.push([from, Math.min(from + PAGE_SIZE - 1, totalMatches - 1)]);
      }

      const allMatches: Barang[] = [];
      for (let batchStart = 0; batchStart < ranges.length; batchStart += 4) {
        const batch = ranges.slice(batchStart, batchStart + 4);
        const batchResults = await Promise.all(
          batch.map(([from, to]) =>
            supabase
              .from('barang')
              .select('*')
              .or(searchFilter)
              .order('kodebarang', { ascending: true })
              .range(from, to)
          )
        );

        for (const result of batchResults) {
          if (result.error) throw result.error;
          if (result.data) allMatches.push(...(result.data as Barang[]));
        }
      }

      if (allMatches.length > 0) {
        setBarangList((prev) => {
          const existingCodes = new Set(prev.map((b) => b.kodebarang));
          const newItems = allMatches.filter((b) => !existingCodes.has(b.kodebarang));
          if (newItems.length > 0) {
            return [...prev, ...newItems];
          }
          return prev;
        });
      }
      return allMatches;
    } catch (err) {
      console.warn('Server search error:', err);
    }
    return [];
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // 1. Add Barang
  const addBarang = async (itemData: Omit<Barang, 'updated_at'>): Promise<boolean> => {
    try {
      if (!isValidItemCode(itemData.kodebarang)) return false;
      const newItem: Barang = {
        ...itemData,
        kodebarang: normalizeItemCode(itemData.kodebarang),
        updated_at: new Date().toISOString(),
      };

      // Optimistic update
      setBarangList((prev) => [newItem, ...prev]);

      // Mutation record
      const mutasi: MutasiStok = {
        id: `mut-${Date.now()}`,
        kodebarang: newItem.kodebarang,
        namabarang: newItem.namabarang,
        stok_sebelum: 0,
        stok_sesudah: newItem.stok,
        perubahan: newItem.stok,
        user_id: currentUser.id,
        user_name: currentUser.name,
        tipe: 'manual',
        keterangan: 'Penambahan Master Barang Baru',
        created_at: new Date().toISOString(),
      };
      setMutasiList((prev) => [mutasi, ...prev]);

      // Persist to local LAN server (server updates cache and pushes to Supabase Cloud)
      void syncCrudToServer('create_barang', { item: newItem, mutasi });

      sound.playSuccessChime();
      return true;
    } catch (err) {
      sound.playErrorBeep();
      console.error(err);
      return false;
    }
  };

  const receiveGoods: InventoryContextType['receiveGoods'] = async (receipt) => {
    try {
      const normalizedCodes = receipt.items.map((line) => normalizeItemCode(line.kodebarang));
      if (!receipt.nomor_faktur.trim() || !receipt.supplier.trim() || receipt.items.length === 0) return false;
      if (receipt.items.some((line) => !isValidItemCode(line.kodebarang))) return false;
      if (new Set(normalizedCodes).size !== normalizedCodes.length) return false;
      if (receipt.items.some((line) => !Number.isInteger(line.jumlah) || line.jumlah <= 0)) return false;

      const now = new Date().toISOString();
      const updatedItems: Barang[] = [];
      const mutations: MutasiStok[] = [];

      for (const line of receipt.items) {
        const code = normalizeItemCode(line.kodebarang);
        const existing = barangList.find((item) => item.kodebarang.trim().toUpperCase() === code.toUpperCase());
        const notes = `Barang masuk faktur ${receipt.nomor_faktur.trim()} dari ${receipt.supplier.trim()} (${receipt.tanggal})${receipt.catatan?.trim() ? ` - ${receipt.catatan.trim()}` : ''}`;

        if (existing) {
          if (line.barangBaru) return false;
          const stockByLocation: Record<StockLocation, number> = {
            gudang: getItemLocationStock(existing, 'gudang') + line.jumlah,
            toko: getItemLocationStock(existing, 'toko'),
            reseller: getItemLocationStock(existing, 'reseller'),
            online: getItemLocationStock(existing, 'online'),
            cacat: getItemLocationStock(existing, 'cacat'),
          };
          const totalStock = Object.values(stockByLocation).reduce((sum, stock) => sum + stock, 0);
          const updated = { ...existing, stok: totalStock, stok_lokasi: stockByLocation, updated_at: now };
          const mutation: MutasiStok = {
            id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kodebarang: existing.kodebarang,
            namabarang: existing.namabarang,
            stok_sebelum: existing.stok,
            stok_sesudah: totalStock,
            perubahan: line.jumlah,
            user_id: currentUser.id,
            user_name: currentUser.name,
            tipe: 'barang_masuk',
            lokasi_asal: null,
            lokasi_tujuan: 'gudang',
            jumlah_pergerakan: line.jumlah,
            stok_lokasi_sebelum: getItemLocationStock(existing, 'gudang'),
            stok_lokasi_sesudah: stockByLocation.gudang,
            referensi_tipe: 'barang_masuk',
            referensi_id: receipt.nomor_faktur.trim(),
            keterangan: notes,
            created_at: now,
          };
          updatedItems.push(updated);
          mutations.push(mutation);
          continue;
        }

        if (!line.barangBaru || line.barangBaru.kodebarang.trim().toUpperCase() !== code.toUpperCase()) return false;
        const stockByLocation: Record<StockLocation, number> = {
          gudang: line.jumlah, toko: 0, reseller: 0, online: 0, cacat: 0,
        };
        const item: Barang = {
          ...line.barangBaru,
          kodebarang: code,
          stok: line.jumlah,
          lokasi: 'gudang',
          stok_lokasi: stockByLocation,
          supplier: line.barangBaru.supplier || receipt.supplier.trim(),
          updated_at: now,
        };
        const mutation: MutasiStok = {
          id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kodebarang: code,
          namabarang: item.namabarang,
          stok_sebelum: 0,
          stok_sesudah: line.jumlah,
          perubahan: line.jumlah,
          user_id: currentUser.id,
          user_name: currentUser.name,
          tipe: 'barang_masuk',
          lokasi_asal: null,
          lokasi_tujuan: 'gudang',
          jumlah_pergerakan: line.jumlah,
          stok_lokasi_sebelum: 0,
          stok_lokasi_sesudah: line.jumlah,
          referensi_tipe: 'barang_masuk',
          referensi_id: receipt.nomor_faktur.trim(),
          keterangan: `${notes} - master barang baru`,
          created_at: now,
        };
        updatedItems.push(item);
        mutations.push(mutation);
      }

      const receiptHeader: Omit<GoodsReceipt, 'items'> = {
          nomor_faktur: receipt.nomor_faktur.trim(),
          supplier: receipt.supplier.trim(),
          supplier_kode: receipt.supplier_kode || null,
          tanggal: receipt.tanggal,
          catatan: receipt.catatan?.trim() || null,
          total_baris: receipt.items.length,
          total_qty: receipt.items.reduce((total, line) => total + line.jumlah, 0),
          created_by: currentUser.id,
          created_by_name: currentUser.name,
          created_at: now,
      };
      const receiptItems: GoodsReceiptLine[] = receipt.items.map((line) => {
          const item = updatedItems.find((entry) => entry.kodebarang.trim().toUpperCase() === line.kodebarang.trim().toUpperCase());
          return {
            id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `receipt-line-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            nomor_faktur: receipt.nomor_faktur.trim(),
            kodebarang: item?.kodebarang || line.kodebarang.trim(),
            namabarang: item?.namabarang || line.barangBaru?.namabarang || '',
            jumlah: line.jumlah,
            satuan: item?.satuan || line.barangBaru?.satuan || 'Pcs',
            hargapokok: item?.hargapokok || line.barangBaru?.hargapokok || 0,
            hargajual: item?.hargajual || line.barangBaru?.hargajual || 0,
            created_at: now,
          };
      });
      const receiptSaved = await saveGoodsReceiptToServer({
        header: receiptHeader,
        items: receiptItems,
        updatedBarangList: updatedItems,
        mutasiList: mutations,
      });
      if (!receiptSaved.success) throw new Error(receiptSaved.message || 'Faktur gagal disimpan ke server.');

      setBarangList((previous) => {
        const byCode = new Map(updatedItems.map((item) => [item.kodebarang, item]));
        const addedItems = updatedItems.filter((item) => !barangList.some((oldItem) => oldItem.kodebarang === item.kodebarang));
        return [...addedItems, ...previous.map((item) => byCode.get(item.kodebarang) || item)];
      });
      setBarangMasukList((previous) => [{ ...receiptHeader, items: receiptItems }, ...previous]);
      setMutasiList((previous) => [...mutations, ...previous]);
      sound.playSuccessChime();
      return true;
    } catch (error) {
      sound.playErrorBeep();
      console.error(error);
      return false;
    }
  };

  const deleteGoodsReceipt: InventoryContextType['deleteGoodsReceipt'] = async (nomorFaktur) => {
    if (currentUser.role !== 'admin') return { success: false, message: 'Hanya Admin yang dapat menghapus faktur.' };
    const result = await deleteGoodsReceiptFromServer(
      nomorFaktur,
      { email: currentUser.email, password: currentUser.password || '' },
      currentUser.id,
      currentUser.name,
    );
    if (!result.success || !result.barang) {
      return { success: false, message: result.message || 'Faktur gagal dihapus.' };
    }
    const updatedByCode = new Map(result.barang.map((item) => [item.kodebarang, item]));
    setBarangList((previous) => previous.map((item) => updatedByCode.get(item.kodebarang) || item));
    setBarangMasukList((previous) => previous.filter((receipt) => receipt.nomor_faktur !== nomorFaktur));
    sound.playSuccessChime();
    return {
      success: true,
      queued: result.queued,
      message: result.queued
        ? 'Faktur dihapus. Pembalikan stok akan disinkronkan saat cloud tersambung.'
        : 'Faktur dihapus dan stok gudang dikurangi sesuai faktur.',
    };
  };

  // 2. Update Barang
  const updateBarang = async (kodebarang: string, updates: Partial<Barang>): Promise<boolean> => {
    try {
      if (!isValidItemCode(kodebarang) || (updates.kodebarang !== undefined && normalizeItemCode(updates.kodebarang) !== normalizeItemCode(kodebarang))) return false;
      const oldItem = barangList.find((b) => b.kodebarang === kodebarang);
      if (!oldItem) return false;

      const updatedItem: Barang = {
        ...oldItem,
        ...updates,
        updated_at: new Date().toISOString(),
      };

      setBarangList((prev) =>
        prev.map((b) => (b.kodebarang === kodebarang ? updatedItem : b))
      );

      // Record mutation if stock changed
      let mutasi: MutasiStok | undefined;
      if (updates.stok !== undefined && updates.stok !== oldItem.stok) {
        const delta = updates.stok - oldItem.stok;
        mutasi = {
          id: `mut-${Date.now()}`,
          kodebarang,
          namabarang: updatedItem.namabarang,
          stok_sebelum: oldItem.stok,
          stok_sesudah: updates.stok,
          perubahan: delta,
          user_id: currentUser.id,
          user_name: currentUser.name,
          tipe: 'manual',
          keterangan: 'Koreksi Stok Manual Master Barang',
          created_at: new Date().toISOString(),
        };
        setMutasiList((prev) => [mutasi!, ...prev]);

      }

      // Persist to LAN server & Supabase Cloud
      void syncCrudToServer('update_barang', { kodebarang, updates, mutasi });

      sound.playSuccessChime();
      return true;
    } catch (err) {
      sound.playErrorBeep();
      return false;
    }
  };

  // 3. Delete Barang
  const deleteBarang = async (kodebarang: string): Promise<boolean> => {
    try {
      setBarangList((prev) => prev.filter((b) => b.kodebarang !== kodebarang));
      
      // Delete from LAN server cache + tombstone + cloud deletion
      void syncCrudToServer('delete_barang', { kodebarang });
      void deleteLocalRecord('barang', kodebarang);

      sound.playSuccessChime();
      return true;
    } catch (err) {
      sound.playErrorBeep();
      return false;
    }
  };

  // 3b. Clear all Master Data (Reset / Kosongkan data demo)
  const clearAllMasterData = async (): Promise<boolean> => {
    try {
      setBarangList([]);
      setMutasiList([]);
      setPenjualanList([]);
      setOpnameHistoryList([]);
      setPermintaanMutasiList([]);
      setReturStokList([]);
      localStorage.removeItem(STORAGE_KEYS.BARANG);
      localStorage.removeItem(STORAGE_KEYS.MUTASI);
      localStorage.removeItem(STORAGE_KEYS.PENJUALAN);
      localStorage.removeItem(STORAGE_KEYS.OPNAME);
      localStorage.removeItem(STORAGE_KEYS.PERMINTAAN_MUTASI);
      localStorage.removeItem(STORAGE_KEYS.RETUR_STOK);
      void idbClear();

      void syncCrudToServer('clear_all_data', {});

      sound.playSuccessChime();
      return true;
    } catch (err) {
      sound.playErrorBeep();
      return false;
    }
  };

  // 5. Batch Opname Execution
  const processOpname = async (
    items: { kodebarang: string; stok_fisik: number }[],
    fileName: string,
    location: StockLocation = 'gudang'
  ): Promise<{ success: boolean; totalProses: number; totalSelisih: number }> => {
    if (currentUser.role !== 'admin' && currentUser.role !== location) {
      sound.playErrorBeep();
      return { success: false, totalProses: 0, totalSelisih: 0 };
    }
    if (items.some((item) => !Number.isInteger(item.stok_fisik) || item.stok_fisik < 0)) {
      sound.playErrorBeep();
      return { success: false, totalProses: 0, totalSelisih: 0 };
    }
    const currentMap = new Map<string, Barang>(barangList.map((barang) => [normalizeItemCode(barang.kodebarang), barang]));
    if (items.some((item) => {
      const barang = currentMap.get(normalizeItemCode(item.kodebarang));
      return barang && item.stok_fisik < getItemLocationStock(barang, location);
    })) {
      sound.playErrorBeep();
      return { success: false, totalProses: 0, totalSelisih: 0 };
    }

    try {
      let totalProses = 0;
      let totalSesuai = 0;
      let totalSelisih = 0;
      const opnameDetails: OpnameHistory['details'] = [];
      const newMutations: MutasiStok[] = [];

      const nextList = [...barangList];

      items.forEach((item) => {
        const barang = currentMap.get(item.kodebarang.toUpperCase());
        if (barang) {
          totalProses++;
          const currentLocationStock = getItemLocationStock(barang, location);
          const selisih = item.stok_fisik - currentLocationStock;
          if (selisih === 0) {
            totalSesuai++;
          } else {
            totalSelisih++;
            const idx = nextList.findIndex((b) => b.kodebarang === barang.kodebarang);
            if (idx !== -1) {
              const stockByLocation = {
                ...(barang.stok_lokasi || {}),
                gudang: getItemLocationStock(barang, 'gudang'),
                toko: getItemLocationStock(barang, 'toko'),
                reseller: getItemLocationStock(barang, 'reseller'),
                online: getItemLocationStock(barang, 'online'),
                cacat: getItemLocationStock(barang, 'cacat'),
                [location]: item.stok_fisik,
              };
              nextList[idx] = {
                ...barang,
                stok_lokasi: stockByLocation,
                stok: Object.values(stockByLocation).reduce((total, stock) => total + (Number(stock) || 0), 0),
                updated_at: new Date().toISOString(),
              };
            }
            const updatedBarang = nextList.find((candidate) => candidate.kodebarang === barang.kodebarang)!;

            newMutations.push({
              id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              kodebarang: barang.kodebarang,
              namabarang: barang.namabarang,
              stok_sebelum: barang.stok,
              stok_sesudah: updatedBarang.stok,
              perubahan: updatedBarang.stok - barang.stok,
              user_id: currentUser.id,
              user_name: currentUser.name,
              tipe: 'opname',
              lokasi_asal: location,
              lokasi_tujuan: location,
              jumlah_pergerakan: selisih,
              stok_lokasi_sebelum: currentLocationStock,
              stok_lokasi_sesudah: item.stok_fisik,
              referensi_tipe: 'opname',
              referensi_id: fileName,
              keterangan: `Stock Opname Excel: ${fileName}`,
              created_at: new Date().toISOString(),
            });
          }

          opnameDetails.push({
            kodebarang: barang.kodebarang,
            namabarang: barang.namabarang,
            stok_sistem: currentLocationStock,
            stok_fisik: item.stok_fisik,
            selisih,
          });
        }
      });

      const newOpnameHistory: OpnameHistory = {
        id: `opn-${Date.now()}`,
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role,
        lokasi: location,
        file_name: fileName,
        total_proses: totalProses,
        total_sesuai: totalSesuai,
        total_selisih: totalSelisih,
        status: 'sukses',
        details: opnameDetails,
        created_at: new Date().toISOString(),
      };

      setBarangList(nextList);
      setMutasiList((prev) => [...newMutations, ...prev]);
      setOpnameHistoryList((prev) => [newOpnameHistory, ...prev]);

      const changedBarangs = nextList.filter((b) => items.some((i) => i.kodebarang.toUpperCase() === b.kodebarang.toUpperCase()));
      void syncCrudToServer('record_opname', {
        opname: newOpnameHistory,
        updatedBarangList: changedBarangs,
        mutasiList: newMutations,
      });

      sound.playSuccessChime();
      return { success: true, totalProses, totalSelisih };
    } catch (err) {
      sound.playErrorBeep();
      return { success: false, totalProses: 0, totalSelisih: 0 };
    }
  };

  // 6. Kasir Sales Batch Execution (Atomic Stock Deduction + Sales History Logging)
  const processKasirPenjualan = async (
    items: { kodebarang: string; jumlah_terjual: number }[],
    keterangan = 'Upload Penjualan POS Kasir'
  ): Promise<{ success: boolean; totalItems: number; totalNominal: number; message: string }> => {
    try {
      const salesLocation = getCashierSalesLocation(currentUser.role) || 'toko';
      const groupedItems = new Map<string, { kodebarang: string; jumlah_terjual: number }>();
      for (const item of items) {
        const key = item.kodebarang.trim().toUpperCase();
        const existing = groupedItems.get(key);
        groupedItems.set(key, {
          kodebarang: existing?.kodebarang || item.kodebarang,
          jumlah_terjual: (existing?.jumlah_terjual || 0) + item.jumlah_terjual,
        });
      }
      const saleItems = Array.from(groupedItems.values());
      const transactionId = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sale-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const createdAt = new Date().toISOString();
      const currentMap = new Map<string, Barang>(barangList.map((b) => [b.kodebarang.toUpperCase(), b]));

      // 1. Validation check
      for (const item of saleItems) {
        const b = currentMap.get(item.kodebarang.toUpperCase());
        if (!b) {
          sound.playErrorBeep();
          return {
            success: false,
            totalItems: 0,
            totalNominal: 0,
            message: `Gagal: Barang ${item.kodebarang} tidak ditemukan di database.`,
          };
        }
        const locationStock = getItemLocationStock(b, salesLocation);
        if (locationStock < item.jumlah_terjual) {
          sound.playErrorBeep();
          return {
            success: false,
            totalItems: 0,
            totalNominal: 0,
            message: `Gagal: Stok ${salesLocation.toUpperCase()} "${b.namabarang}" tidak mencukupi (Sisa: ${locationStock}, Terjual: ${item.jumlah_terjual}).`,
          };
        }
      }

      // 2. Perform atomic local state deduction
      let totalItems = 0;
      let totalNominal = 0;
      const nextList = [...barangList];
      const newMutations: MutasiStok[] = [];
      const newSales: PenjualanHistory[] = [];

      saleItems.forEach((item) => {
        const b = currentMap.get(item.kodebarang.toUpperCase())!;
        const idx = nextList.findIndex((x) => x.kodebarang === b.kodebarang);
        const subtotal = item.jumlah_terjual * b.hargajual;

        totalItems += item.jumlah_terjual;
        totalNominal += subtotal;

        if (idx !== -1) {
          const updatedLocationStock = {
            ...(b.stok_lokasi || {}),
            gudang: getItemLocationStock(b, 'gudang'),
            toko: getItemLocationStock(b, 'toko'),
            reseller: getItemLocationStock(b, 'reseller'),
            online: getItemLocationStock(b, 'online'),
            cacat: getItemLocationStock(b, 'cacat'),
          };
          updatedLocationStock[salesLocation] = Math.max(0, getItemLocationStock(b, salesLocation) - item.jumlah_terjual);
          nextList[idx] = {
            ...b,
            stok: Math.max(0, b.stok - item.jumlah_terjual),
            stok_lokasi: updatedLocationStock,
            updated_at: new Date().toISOString(),
          };
        }

        // Add to Mutasi
        newMutations.push({
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `mut-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          kodebarang: b.kodebarang,
          namabarang: b.namabarang,
          stok_sebelum: b.stok,
          stok_sesudah: b.stok - item.jumlah_terjual,
          perubahan: -item.jumlah_terjual,
          user_id: currentUser.id,
          user_name: currentUser.name,
          tipe: 'penjualan',
          lokasi_asal: salesLocation,
          lokasi_tujuan: null,
          jumlah_pergerakan: item.jumlah_terjual,
          stok_lokasi_sebelum: getItemLocationStock(b, salesLocation),
          stok_lokasi_sesudah: getItemLocationStock(b, salesLocation) - item.jumlah_terjual,
          referensi_tipe: 'penjualan',
          referensi_id: transactionId,
          keterangan: `Penjualan Kasir (${currentUser.name})`,
          created_at: createdAt,
        });

        // Add to Penjualan History
        newSales.push({
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `pj-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          transaction_id: transactionId,
          kodebarang: b.kodebarang,
          namabarang: b.namabarang,
          jumlah_terjual: item.jumlah_terjual,
          hargajual: b.hargajual,
          total_nilai: subtotal,
          user_id: currentUser.id,
          user_name: currentUser.name,
          lokasi: salesLocation,
          keterangan,
          created_at: createdAt,
        });
      });

      setBarangList(nextList);
      setMutasiList((prev) => [...newMutations, ...prev]);
      setPenjualanList((prev) => [...newSales, ...prev]);

      // Safely persist to local LAN server (server updates cache and pushes/queues to Supabase Cloud)
      const changedBarangs = nextList.filter((b) => saleItems.some((i) => i.kodebarang.toUpperCase() === b.kodebarang.toUpperCase()));
      void syncCrudToServer('record_penjualan', {
        items: saleItems,
        salesList: newSales,
        mutasiList: newMutations,
        updatedBarangList: changedBarangs,
      });

      sound.playSuccessChime();
      return {
        success: true,
        totalItems,
        totalNominal,
        message: `Berhasil memproses ${saleItems.length} item penjualan (${totalItems} pcs). Stok berhasil diperbarui.`,
      };
    } catch (err: unknown) {
      sound.playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      return {
        success: false,
        totalItems: 0,
        totalNominal: 0,
        message: msg,
      };
    }
  };

  const deleteSalesRecord = async (saleId: string): Promise<{ success: boolean; message: string }> => {
    if (currentUser.role !== 'admin') {
      return { success: false, message: 'Hanya Admin yang dapat menghapus transaksi penjualan.' };
    }
    const sale = penjualanList.find((entry) => entry.id === saleId);
    if (!sale) return { success: false, message: 'Transaksi tidak ditemukan atau sudah dihapus.' };
    const barang = barangList.find((entry) => entry.kodebarang === sale.kodebarang);
    if (!barang) return { success: false, message: 'Master barang transaksi tidak ditemukan; stok tidak diubah.' };

    const locations: Record<StockLocation, number> = {
      gudang: getItemLocationStock(barang, 'gudang'),
      toko: getItemLocationStock(barang, 'toko'),
      reseller: getItemLocationStock(barang, 'reseller'),
      online: getItemLocationStock(barang, 'online'),
      cacat: getItemLocationStock(barang, 'cacat'),
    };
    const location: SalesStockLocation = ['toko', 'reseller', 'online', 'cacat'].includes(String(sale.lokasi))
      ? sale.lokasi as SalesStockLocation
      : 'toko';
    locations[location] += sale.jumlah_terjual;
    const updatedBarang: Barang = {
      ...barang,
      stok_lokasi: locations,
      stok: Object.values(locations).reduce((total, quantity) => total + quantity, 0),
      updated_at: new Date().toISOString(),
    };
    const reversalMutation: MutasiStok = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `mut-void-${Date.now()}`,
      kodebarang: sale.kodebarang,
      namabarang: sale.namabarang,
      stok_sebelum: barang.stok,
      stok_sesudah: updatedBarang.stok,
      perubahan: sale.jumlah_terjual,
      user_id: currentUser.id,
      user_name: currentUser.name,
      tipe: 'manual',
      keterangan: `Pembatalan penjualan ${sale.transaction_id || sale.id}; stok ${location} dikembalikan oleh Admin ${currentUser.name}.`,
      created_at: new Date().toISOString(),
    };
    const result = await syncCrudToServer('delete_penjualan', {
      saleId,
      credentials: { email: currentUser.email, password: currentUser.password || '' },
      reversalMutation,
    });
    if (!result.success) return { success: false, message: result.message || 'Gagal menghapus transaksi.' };
    if (result.alreadyDeleted) {
      setPenjualanList((previous) => previous.filter((entry) => entry.id !== saleId));
      return { success: true, message: 'Transaksi sudah dihapus sebelumnya.' };
    }

    setBarangList((previous) => previous.map((item) => item.kodebarang === updatedBarang.kodebarang ? updatedBarang : item));
    setPenjualanList((previous) => previous.filter((entry) => entry.id !== saleId));
    setMutasiList((previous) => [reversalMutation, ...previous]);
    sound.playSuccessChime();
    return { success: true, message: `Transaksi dihapus. ${sale.jumlah_terjual} stok ${location} dikembalikan.` };
  };

  // 8. Create Stock Mutation Request (Permintaan Mutasi)
  const createPermintaanMutasi = async (params: {
    kodebarang: string;
    asal_lokasi: StockLocation;
    tujuan_lokasi: StockLocation;
    jumlah_diminta: number;
    alasan?: string;
    nomor_permintaan?: string;
  }): Promise<{ success: boolean; message: string; data?: PermintaanMutasi }> => {
    try {
      const item = barangList.find((b) => b.kodebarang === params.kodebarang);
      if (!item) {
        sound.playErrorBeep();
        return { success: false, message: 'Barang tidak ditemukan di database.' };
      }

      if (params.asal_lokasi === params.tujuan_lokasi) {
        sound.playErrorBeep();
        return { success: false, message: 'Lokasi asal dan tujuan mutasi tidak boleh sama.' };
      }

      if (params.jumlah_diminta <= 0) {
        sound.playErrorBeep();
        return { success: false, message: 'Jumlah yang diminta harus lebih besar dari 0.' };
      }

      const nomorPermintaan = params.nomor_permintaan || createMutationRequestNumber();
      const createdAt = new Date().toISOString();

      const newReq: PermintaanMutasi = {
        id: typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        nomor_permintaan: nomorPermintaan,
        kodebarang: item.kodebarang,
        namabarang: item.namabarang,
        asal_lokasi: params.asal_lokasi,
        tujuan_lokasi: params.tujuan_lokasi,
        jumlah_diminta: params.jumlah_diminta,
        satuan: item.satuan,
        alasan: params.alasan || `Permintaan restock untuk saluran ${params.tujuan_lokasi}`,
        status: 'pending',
        pemohon_id: currentUser.id,
        pemohon_name: currentUser.name,
        pemohon_role: currentUser.role,
        created_at: createdAt,
      };

      setPermintaanMutasiList((prev) => [newReq, ...prev]);

      // Persist to local LAN server (updates cache and pushes to Supabase Cloud)
      void syncCrudToServer('create_permintaan_mutasi', { items: [newReq] });

      sound.playSuccessChime();
      return {
        success: true,
        message: `Permintaan mutasi ${nomorPermintaan} berhasil dibuat dan menunggu persetujuan dari ${params.asal_lokasi.toUpperCase()}.`,
        data: newReq,
      };
    } catch (err: unknown) {
      sound.playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      return { success: false, message: msg };
    }
  };

  const createPermintaanMutasiBatch = async (params: {
    items: MutationRequestLine[];
    asal_lokasi: StockLocation;
    tujuan_lokasi: StockLocation;
    alasan?: string;
  }): Promise<{ success: boolean; message: string; data?: PermintaanMutasi[] }> => {
    if (params.items.length === 0) {
      return { success: false, message: 'Tambahkan minimal satu barang ke nota mutasi.' };
    }
    const nomorPermintaan = createMutationRequestNumber();
    const created: PermintaanMutasi[] = [];

    for (const item of params.items) {
      const result = await createPermintaanMutasi({
        ...params,
        ...item,
        nomor_permintaan: nomorPermintaan,
      });
      if (!result.success) {
        return { success: false, message: `${item.kodebarang}: ${result.message}`, data: created };
      }
      if (result.data) created.push(result.data);
    }

    return {
      success: true,
      message: `Nota mutasi ${nomorPermintaan} berisi ${created.length} barang berhasil dibuat.`,
      data: created,
    };
  };

  const createReturStok = async (params: {
    kodebarang: string;
    asal_lokasi: StockLocation;
    tujuan_lokasi: StockLocation | null;
    supplier: string | null;
    jumlah: number;
    alasan?: string;
  }): Promise<{ success: boolean; message: string; data?: ReturStok }> => {
    const item = barangList.find((barang) => barang.kodebarang === params.kodebarang);
    if (!item) return { success: false, message: 'Barang tidak ditemukan di database.' };
    if (!Number.isInteger(params.jumlah) || params.jumlah <= 0) {
      return { success: false, message: 'Jumlah retur harus bilangan bulat lebih dari 0.' };
    }
    if (params.jumlah > getItemLocationStock(item, params.asal_lokasi)) {
      return { success: false, message: `Stok ${params.asal_lokasi.toUpperCase()} tidak mencukupi untuk jumlah retur tersebut.` };
    }
    if (params.asal_lokasi === 'gudang' ? !params.supplier?.trim() : !params.tujuan_lokasi) {
      return { success: false, message: params.asal_lokasi === 'gudang' ? 'Nama supplier wajib diisi.' : 'Lokasi tujuan wajib dipilih.' };
    }
    if (params.tujuan_lokasi === params.asal_lokasi) {
      return { success: false, message: 'Lokasi tujuan harus berbeda dari lokasi asal.' };
    }

    const createdAt = new Date().toISOString();
    const request: ReturStok = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `retur-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      nomor_retur: createMutationRequestNumber().replace(/^REQ-/, 'RET-'),
      kodebarang: item.kodebarang,
      namabarang: item.namabarang,
      asal_lokasi: params.asal_lokasi,
      tujuan_lokasi: params.asal_lokasi === 'gudang' ? null : params.tujuan_lokasi,
      supplier: params.asal_lokasi === 'gudang' ? params.supplier?.trim() || null : null,
      jumlah: params.jumlah,
      satuan: item.satuan,
      alasan: params.alasan?.trim() || undefined,
      status: 'pending',
      pemohon_id: currentUser.id,
      pemohon_name: currentUser.name,
      pemohon_role: currentUser.role,
      created_at: createdAt,
    };

    setReturStokList((previous) => [request, ...previous]);
    const syncResult = await syncCrudToServer('create_retur_stok', { items: [request] });
    if (!syncResult.success) {
      const { error } = await supabase.from('retur_stok').upsert(request, { onConflict: 'id' });
      if (error) {
        console.warn('Retur tersimpan lokal, sinkron cloud menunggu:', syncResult.message, error.message);
      }
    }
    sound.playSuccessChime();
    return { success: true, message: `Request ${request.nomor_retur} berhasil dibuat.`, data: request };
  };

  const processReturStok = async (requestId: string): Promise<{ success: boolean; message: string }> => {
    const request = returStokList.find((entry) => entry.id === requestId);
    if (!request) return { success: false, message: 'Nota retur tidak ditemukan.' };
    if (request.status !== 'pending') return { success: false, message: `Nota retur ini sudah ${request.status}.` };

    const canProcess = currentUser.role === 'admin'
      || request.tujuan_lokasi === currentUser.role
      || (request.asal_lokasi === 'gudang' && request.tujuan_lokasi === null && currentUser.role === 'gudang');
    if (!canProcess) return { success: false, message: 'Hanya Admin atau petugas lokasi tujuan yang dapat memproses retur ini.' };

    const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const { data, error } = await supabase.rpc('process_retur_stok', {
      p_retur_id: request.id,
      p_processor_id: isUuid(currentUser.id) ? currentUser.id : null,
      p_processor_name: currentUser.name,
    });
    if (error) {
      sound.playErrorBeep();
      const message = error.code === 'PGRST202' || error.message.includes('process_retur_stok')
        ? 'Fungsi retur belum tersedia di Supabase. Jalankan migrasi Retur Stok terlebih dahulu.'
        : error.message;
      return { success: false, message };
    }

    const processed = data as { request?: ReturStok; barang?: Barang; mutasi?: MutasiStok } | null;
    if (!processed?.request || !processed.barang || !processed.mutasi) {
      sound.playErrorBeep();
      return { success: false, message: 'Supabase tidak mengembalikan hasil proses retur yang lengkap.' };
    }

    setReturStokList((previous) => previous.map((entry) => entry.id === requestId ? processed.request! : entry));
    setBarangList((previous) => previous.map((item) => item.kodebarang === processed.barang!.kodebarang ? processed.barang! : item));
    setMutasiList((previous) => [processed.mutasi!, ...previous]);

    const syncResult = await syncCrudToServer('process_retur_stok', {
      request: processed.request,
      updatedBarang: processed.barang,
      mutasi: processed.mutasi,
    });
    if (!syncResult.success) {
      console.warn('Retur sudah diproses di Supabase, cache LAN akan diperbarui pada sinkronisasi berikutnya:', syncResult.message);
    }
    sound.playSuccessChime();
    return {
      success: true,
      message: request.tujuan_lokasi
        ? `Retur ${request.nomor_retur} diproses. Stok ${request.asal_lokasi} berkurang dan stok ${request.tujuan_lokasi} bertambah ${request.jumlah} ${request.satuan}.`
        : `Retur ${request.nomor_retur} ke supplier diproses. Stok gudang berkurang ${request.jumlah} ${request.satuan}.`,
    };
  };

  // 9. Approve Stock Mutation Request (Setujui Permintaan)
  const approvePermintaanMutasi = async (
    requestId: string,
    catatanApproval?: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const req = permintaanMutasiList.find((r) => r.id === requestId);
      if (!req) {
        sound.playErrorBeep();
        return { success: false, message: 'Data permintaan mutasi tidak ditemukan.' };
      }

      if (req.status !== 'pending') {
        sound.playErrorBeep();
        return { success: false, message: `Permintaan ini sudah ${req.status}.` };
      }

      // Check user authorization (must be admin OR staff from asal_lokasi)
      const isAuthorized = currentUser.role === 'admin' || currentUser.role === req.asal_lokasi;
      if (!isAuthorized) {
        sound.playErrorBeep();
        return {
          success: false,
          message: `Hanya staff ${req.asal_lokasi.toUpperCase()} atau Admin yang dapat menyetujui permintaan ini.`,
        };
      }

      // Check stock availability at asal_lokasi
      const item = barangList.find((b) => b.kodebarang === req.kodebarang);
      if (!item) {
        sound.playErrorBeep();
        return { success: false, message: 'Barang tidak ditemukan di master data.' };
      }

      const availableStockAtSource = getItemLocationStock(item, req.asal_lokasi);
      if (availableStockAtSource < req.jumlah_diminta) {
        sound.playErrorBeep();
        return {
          success: false,
          message: `Stok pada saluran ${req.asal_lokasi.toUpperCase()} tidak mencukupi! (Tersedia: ${availableStockAtSource} ${req.satuan}, Diminta: ${req.jumlah_diminta} ${req.satuan})`,
        };
      }

      // Perform atomic stock transfer across locations
      const updatedStokLokasi: Record<StockLocation, number> = {
        gudang: getItemLocationStock(item, 'gudang'),
        toko: getItemLocationStock(item, 'toko'),
        reseller: getItemLocationStock(item, 'reseller'),
        online: getItemLocationStock(item, 'online'),
        cacat: getItemLocationStock(item, 'cacat'),
        ...(item.stok_lokasi || {}),
      };

      updatedStokLokasi[req.asal_lokasi] = Math.max(0, updatedStokLokasi[req.asal_lokasi] - req.jumlah_diminta);
      updatedStokLokasi[req.tujuan_lokasi] = (updatedStokLokasi[req.tujuan_lokasi] || 0) + req.jumlah_diminta;

      // Create mutasi log
      const mutasi: MutasiStok = {
        id: `mut-${Date.now()}`,
        kodebarang: item.kodebarang,
        namabarang: item.namabarang,
        stok_sebelum: item.stok,
        stok_sesudah: item.stok,
        perubahan: 0,
        user_id: currentUser.id,
        user_name: currentUser.name,
        tipe: 'manual',
        lokasi_asal: req.asal_lokasi,
        lokasi_tujuan: req.tujuan_lokasi,
        jumlah_pergerakan: req.jumlah_diminta,
        stok_lokasi_sebelum: availableStockAtSource,
        stok_lokasi_sesudah: availableStockAtSource - req.jumlah_diminta,
        stok_tujuan_sebelum: updatedStokLokasi[req.tujuan_lokasi] - req.jumlah_diminta,
        stok_tujuan_sesudah: updatedStokLokasi[req.tujuan_lokasi],
        referensi_tipe: 'permintaan_mutasi',
        referensi_id: req.nomor_permintaan,
        keterangan: `[${req.nomor_permintaan}] Mutasi ${req.jumlah_diminta} ${req.satuan} dari ${req.asal_lokasi.toUpperCase()} ke ${req.tujuan_lokasi.toUpperCase()} (Disetujui: ${req.asal_lokasi.toUpperCase()})`,
        created_at: new Date().toISOString(),
      };

      // Update local states
      setBarangList((prev) =>
        prev.map((b) =>
          b.kodebarang === req.kodebarang
            ? { ...b, stok_lokasi: updatedStokLokasi, updated_at: new Date().toISOString() }
            : b
        )
      );

      setMutasiList((prev) => [mutasi, ...prev]);

      const updatedRequest: Partial<PermintaanMutasi> = {
        status: 'disetujui',
        disetujui_oleh_id: currentUser.id,
        disetujui_oleh_name: currentUser.name,
        catatan_approval: catatanApproval || `Disetujui oleh ${req.asal_lokasi.toUpperCase()}`,
        updated_at: new Date().toISOString(),
      };

      setPermintaanMutasiList((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, ...updatedRequest }
            : r
        )
      );

      const updatedBarang = { ...item, stok_lokasi: updatedStokLokasi, updated_at: new Date().toISOString() };

      // Persist to local LAN server (updates cache and queues/pushes to Supabase Cloud)
      void syncCrudToServer('approve_permintaan_mutasi', {
        requestId,
        updatedRequest,
        mutasi,
        updatedBarang,
      });

      sound.playSuccessChime();
      return {
        success: true,
        message: `Permintaan ${req.nomor_permintaan} berhasil disetujui! Stok ${req.jumlah_diminta} ${req.satuan} telah dipindahkan ke ${req.tujuan_lokasi.toUpperCase()}.`,
      };
    } catch (err: unknown) {
      sound.playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat menyetujui mutasi';
      return { success: false, message: msg };
    }
  };

  // 10. Reject Stock Mutation Request (Tolak Permintaan)
  const rejectPermintaanMutasi = async (
    requestId: string,
    alasanPenolakan: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const req = permintaanMutasiList.find((r) => r.id === requestId);
      if (!req) {
        sound.playErrorBeep();
        return { success: false, message: 'Data permintaan mutasi tidak ditemukan.' };
      }

      const isAuthorized = currentUser.role === 'admin' || currentUser.role === req.asal_lokasi;
      if (!isAuthorized) {
        sound.playErrorBeep();
        return {
          success: false,
          message: `Hanya staff ${req.asal_lokasi.toUpperCase()} atau Admin yang dapat menolak permintaan ini.`,
        };
      }

      const updatedRequest: Partial<PermintaanMutasi> = {
        status: 'ditolak',
        disetujui_oleh_id: currentUser.id,
        disetujui_oleh_name: currentUser.name,
        catatan_approval: alasanPenolakan || 'Ditolak karena alasan operasional/stok',
        updated_at: new Date().toISOString(),
      };

      setPermintaanMutasiList((prev) =>
        prev.map((r) =>
          r.id === requestId
            ? { ...r, ...updatedRequest }
            : r
        )
      );

      // Persist to LAN server and Supabase Cloud
      void syncCrudToServer('reject_permintaan_mutasi', {
        requestId,
        updatedRequest,
      });

      sound.playScannerBeep();
      return {
        success: true,
        message: `Permintaan ${req.nomor_permintaan} berhasil ditolak.`,
      };
    } catch (err: unknown) {
      sound.playErrorBeep();
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      return { success: false, message: msg };
    }
  };

  const updatePermintaanMutasi = async (requestId: string, updates: Partial<PermintaanMutasi>): Promise<boolean> => {
    if (currentUser.role !== 'admin') return false;
    const updatedAt = new Date().toISOString();
    setPermintaanMutasiList((prev) => prev.map((request) => request.id === requestId ? { ...request, ...updates, updated_at: updatedAt } : request));
    void syncCrudToServer('update_permintaan_mutasi', { requestId, updates });
    return true;
  };

  const deletePermintaanMutasi = async (requestId: string): Promise<boolean> => {
    if (currentUser.role !== 'admin') return false;
    setPermintaanMutasiList((prev) => prev.filter((request) => request.id !== requestId));
    void syncCrudToServer('delete_permintaan_mutasi', { requestId });
    void deleteLocalRecord('permintaanMutasi', requestId);
    return true;
  };

  const saveMinimumStockSettings = async (settings: MinimumStockSettings) => {
    if (currentUser.role !== 'admin') {
      return { success: false, message: 'Hanya Admin yang dapat mengubah batas minimum stok.' };
    }
    const result = await saveMinimumStockSettingsToServer(
      { email: currentUser.email, password: currentUser.password || '' },
      settings,
    );
    if (!result.success || !result.settings) {
      return { success: false, message: result.message || 'Pengaturan gagal disimpan ke server.' };
    }
    setMinStockSettings(result.settings);
    return { success: true };
  };

  const saveSuppliers = async (nextSuppliers: Supplier[]) => {
    if (currentUser.role !== 'admin') return { success: false, message: 'Hanya Admin yang dapat mengelola supplier.' };
    const result = await saveSuppliersToServer(
      { email: currentUser.email, password: currentUser.password || '' },
      nextSuppliers,
    );
    if (!result.success || !result.suppliers) {
      return { success: false, message: result.message || 'Supplier gagal disimpan ke server.' };
    }
    setSuppliers(result.suppliers);
    return { success: true };
  };

  const setOpnameEnabled = async (enabled: boolean) => {
    if (currentUser.role !== 'admin') return { success: false, message: 'Hanya Admin yang dapat mengubah akses opname.' };
    const result = await saveOpnameEnabledToServer(
      { email: currentUser.email, password: currentUser.password || '' },
      enabled,
    );
    if (!result.success || typeof result.enabled !== 'boolean') {
      return { success: false, message: result.message || 'Pengaturan opname gagal disimpan ke server.' };
    }
    setOpnameEnabledState(result.enabled);
    return { success: true };
  };

  return (
    <InventoryContext.Provider
      value={{
        barangList,
        mutasiList,
        opnameHistoryList,
        penjualanList,
        permintaanMutasiList,
        returStokList,
        minStockSettings,
        saveMinimumStockSettings,
        suppliers,
        barangMasukList,
        saveSuppliers,
        opnameEnabled,
        setOpnameEnabled,
        pendingApprovalCount,
        isLoading,
        isDbConnected,
        dbStatusMsg,
        syncProgress,
        refreshData,
        searchBarangServer,
        addBarang,
        receiveGoods,
        deleteGoodsReceipt,
        updateBarang,
        deleteBarang,
        clearAllMasterData,
        processOpname,
        processKasirPenjualan,
        deleteSalesRecord,
        createPermintaanMutasi,
        createPermintaanMutasiBatch,
        createReturStok,
        processReturStok,
        approvePermintaanMutasi,
        rejectPermintaanMutasi,
        updatePermintaanMutasi,
        deletePermintaanMutasi,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
}

