import { Barang, GoodsReceipt, GoodsReceiptLine, MinimumStockSettings, MutasiStok, OpnameHistory, PenjualanHistory, PermintaanMutasi, ReturStok, Supplier, UserProfile } from '../types';

export type LoginUserOption = Pick<UserProfile, 'id' | 'name' | 'role' | 'active'>;

export async function fetchLoginOptions(): Promise<{ success: boolean; users?: LoginUserOption[]; message?: string }> {
  try {
    const response = await fetch('/api/login-options', { signal: AbortSignal.timeout(15000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, message: result.message || `Server HTTP ${response.status}` };
    }
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export interface LocalStateResponse {
  barang: Barang[];
  mutasi: MutasiStok[];
  opname: OpnameHistory[];
  penjualan: PenjualanHistory[];
  permintaanMutasi: PermintaanMutasi[];
  returStok?: ReturStok[];
  suppliers?: Supplier[];
  barangMasuk?: GoodsReceipt[];
  opnameEnabled?: boolean;
  minStockSettings?: MinimumStockSettings;
  updatedAt: string | null;
  source: 'supabase' | 'local-cache' | 'empty-cache';
}

export interface SyncStatusResponse {
  serverOnline: boolean;
  isSupabaseReachable: boolean;
  pendingQueueCount: number;
  itemCounts: {
    barang: number;
    mutasi: number;
    opname: number;
    penjualan: number;
    permintaanMutasi: number;
  };
  updatedAt: string | null;
  lastRemoteSyncAt: string | null;
}

export interface UserSyncCredentials {
  email: string;
  password: string;
}

export type UserSyncAction = 'list' | 'upsert' | 'delete' | 'authenticate';

export type CrudAction =
  | 'create_barang'
  | 'update_barang'
  | 'delete_barang'
  | 'record_penjualan'
  | 'delete_penjualan'
  | 'record_opname'
  | 'create_permintaan_mutasi'
  | 'create_retur_stok'
  | 'process_retur_stok'
  | 'approve_permintaan_mutasi'
  | 'reject_permintaan_mutasi'
  | 'update_permintaan_mutasi'
  | 'delete_permintaan_mutasi'
  | 'clear_all_data';

export async function fetchLocalState(): Promise<LocalStateResponse | null> {
  try {
    const response = await fetch('/api/local-state', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const state = (await response.json()) as LocalStateResponse;
    return Array.isArray(state.barang) ? state : null;
  } catch {
    return null;
  }
}

export async function fetchSyncStatus(): Promise<SyncStatusResponse | null> {
  try {
    const response = await fetch('/api/sync/status', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return (await response.json()) as SyncStatusResponse;
  } catch {
    return null;
  }
}

export async function saveMinimumStockSettings(
  credentials: UserSyncCredentials,
  settings: MinimumStockSettings,
): Promise<{ success: boolean; settings?: MinimumStockSettings; message?: string }> {
  try {
    const response = await fetch('/api/settings/min-stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, settings }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, message: result.message || `Server HTTP ${response.status}` };
    }
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export async function saveOpnameEnabled(
  credentials: UserSyncCredentials,
  enabled: boolean,
): Promise<{ success: boolean; enabled?: boolean; message?: string }> {
  try {
    const response = await fetch('/api/settings/opname', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, enabled }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, message: result.message || `Server HTTP ${response.status}` };
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export async function saveSuppliers(
  credentials: UserSyncCredentials,
  suppliers: Supplier[],
): Promise<{ success: boolean; suppliers?: Supplier[]; message?: string }> {
  try {
    const response = await fetch('/api/suppliers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, suppliers }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, message: result.message || `Server HTTP ${response.status}` };
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export async function saveGoodsReceipt(receipt: {
  header: Omit<GoodsReceipt, 'items'>;
  items: GoodsReceiptLine[];
  updatedBarangList: Barang[];
  mutasiList: MutasiStok[];
}): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receipt),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, message: result.message || `Server HTTP ${response.status}` };
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export async function deleteGoodsReceipt(
  nomorFaktur: string,
  credentials: UserSyncCredentials,
  userId: string,
  userName: string,
): Promise<{ success: boolean; barang?: Barang[]; message?: string; queued?: boolean }> {
  try {
    const response = await fetch(`/api/receipts/${encodeURIComponent(nomorFaktur)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, user_id: userId, user_name: userName }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { success: false, message: result.message || `Server HTTP ${response.status}` };
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export async function syncCrudToServer(
  action: CrudAction,
  payload: Record<string, unknown>
): Promise<{ success: boolean; message?: string; alreadyDeleted?: boolean }> {
  try {
    const response = await fetch('/api/sync/crud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.message || `Server HTTP ${response.status}` };
    }
    return await response.json();
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export async function syncUserToServer(
  action: UserSyncAction,
  credentials: UserSyncCredentials,
  user?: Record<string, unknown>,
  userId?: string,
  email?: string,
): Promise<{ success: boolean; users?: Record<string, unknown>[]; user?: Record<string, unknown>; cloudSynced?: boolean; status?: number; message?: string }> {
  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, credentials, user, userId, email }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, status: response.status, message: result.message || `Server HTTP ${response.status}` };
    }
    return result;
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Koneksi server gagal' };
  }
}

export async function publishLocalState(state: Omit<LocalStateResponse, 'source' | 'updatedAt'>): Promise<LocalStateResponse | null> {
  try {
    const response = await fetch('/api/local-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return (await response.json()) as LocalStateResponse;
  } catch {
    return null;
  }
}

export async function deleteLocalRecord(collection: string, id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/local-state/${collection}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
