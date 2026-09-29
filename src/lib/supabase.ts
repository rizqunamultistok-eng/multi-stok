import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants';
import { Barang, MutasiStok, OpnameHistory, PenjualanHistory, UserProfile, SalesStockLocation } from '../types';

const CUSTOM_URL_KEY = 'pantau_custom_supabase_url';
const CUSTOM_KEY_KEY = 'pantau_custom_supabase_anon_key';

export function getActiveSupabaseCredentials(): { url: string; anonKey: string; isCustom: boolean } {
  try {
    const customUrl = localStorage.getItem(CUSTOM_URL_KEY);
    const customKey = localStorage.getItem(CUSTOM_KEY_KEY);
    if (customUrl && customKey) {
      return { url: customUrl.trim(), anonKey: customKey.trim(), isCustom: true };
    }
  } catch {
    // ignore localStorage errors in private mode
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, isCustom: false };
}

function createClientInstance(url: string, key: string): SupabaseClient {
  if (!url || !key) {
    const fallbackUrl = 'https://example.supabase.co';
    const fallbackKey = 'public-fallback-key';
    return createClient(fallbackUrl, fallbackKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      db: {
        schema: 'public',
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          return window.fetch(input, init);
        },
      },
    });
  }

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    db: {
      schema: 'public',
    },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return window.fetch(input, init);
      },
    },
  });
}

const initialCreds = getActiveSupabaseCredentials();
let activeClient: SupabaseClient = createClientInstance(initialCreds.url, initialCreds.anonKey);

export function setCustomSupabaseCredentials(url: string, key: string): SupabaseClient {
  localStorage.setItem(CUSTOM_URL_KEY, url.trim());
  localStorage.setItem(CUSTOM_KEY_KEY, key.trim());
  activeClient = createClientInstance(url.trim(), key.trim());
  return activeClient;
}

export function resetCustomSupabaseCredentials(): SupabaseClient {
  localStorage.removeItem(CUSTOM_URL_KEY);
  localStorage.removeItem(CUSTOM_KEY_KEY);
  activeClient = createClientInstance(SUPABASE_URL, SUPABASE_ANON_KEY);
  return activeClient;
}

// Proxy wrapper so any existing code using `supabase.from(...)` or `supabase.rpc(...)` seamlessly routes to activeClient!
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const val = (activeClient as unknown as Record<string, unknown>)[prop as string];
    if (typeof val === 'function') {
      return val.bind(activeClient);
    }
    return val;
  },
});

/**
 * Helper to check connection status with Supabase backend
 */
export async function testSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return {
        connected: false,
        message: 'Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env.',
      };
    }

    const { error } = await supabase.from('barang').select('kodebarang').limit(1);
    if (error) {
      // If table does not exist or network error
      return {
        connected: false,
        message: `Koneksi API aktif (${error.message || 'Tabel belum ada'})`,
      };
    }
    return { connected: true, message: 'Terhubung ke Supabase Live Database' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Koneksi gagal';
    return { connected: false, message: errorMsg };
  }
}

/**
 * Helper to test arbitrary Supabase URL and Anon Key before saving
 */
export async function testCustomSupabaseConnection(
  url: string,
  anonKey: string
): Promise<{ connected: boolean; hasTable: boolean; message: string }> {
  try {
    if (!url || !anonKey) {
      return { connected: false, hasTable: false, message: 'URL atau anon key tidak boleh kosong.' };
    }

    if (!url.startsWith('https://')) {
      return { connected: false, hasTable: false, message: 'URL Supabase harus diawali dengan https://' };
    }
    if (!anonKey || anonKey.length < 20) {
      return { connected: false, hasTable: false, message: 'Anon Key tidak valid (terlalu pendek)' };
    }

    const testClient = createClientInstance(url.trim(), anonKey.trim());
    const { error } = await testClient.from('barang').select('kodebarang').limit(1);
    if (error) {
      // If table does not exist, connection is valid but tables are needed
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        return {
          connected: true,
          hasTable: false,
          message: 'Koneksi ke Supabase berhasil! Namun tabel belum dibuat. Silakan salin & jalankan Skema SQL di bawah.',
        };
      }
      return {
        connected: false,
        hasTable: false,
        message: `Gagal query: ${error.message}`,
      };
    }
    return { connected: true, hasTable: true, message: 'Koneksi sukses & tabel barang siap digunakan!' };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Koneksi gagal';
    return { connected: false, hasTable: false, message: `Gagal terhubung: ${errorMsg}` };
  }
}

/**
 * RPC Call Helper for Atomic fn_update_stok
 */
export async function rpcUpdateStok(
  kodebarang: string,
  delta: number,
  userId: string,
  keterangan: string
) {
  try {
    const { data, error } = await supabase.rpc('fn_update_stok', {
      p_kodebarang: kodebarang,
      p_delta: delta,
      p_user_id: userId,
      p_keterangan: keterangan,
    });
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.warn('Fallback: RPC fn_update_stok unavailable, proceeding with client update', err);
    return { success: false, error: err };
  }
}

/**
 * RPC Call Helper for Batch Opname
 */
export async function rpcBatchOpname(
  items: { kodebarang: string; stok_fisik: number }[],
  userId: string,
  fileName: string,
  location: string = 'gudang'
) {
  try {
    const { data, error } = await supabase.rpc('fn_batch_opname', {
      p_items: items,
      p_user_id: userId,
      p_file_name: fileName,
      p_lokasi: location,
    });
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.warn('Fallback: RPC fn_batch_opname unavailable', err);
    return { success: false, error: err };
  }
}

/**
 * RPC Call Helper for Batch Penjualan Kasir
 */
export async function rpcRecordPenjualan(
  items: { kodebarang: string; jumlah_terjual: number }[],
  userEmail: string,
  keterangan: string,
  transactionId: string,
  salesLocation: SalesStockLocation = 'toko'
) {
  try {
    const { data, error } = await supabase.rpc('fn_record_penjualan', {
      p_items: items,
      p_user_email: userEmail,
      p_sales_location: salesLocation,
      p_keterangan: keterangan,
      p_transaction_id: transactionId,
    });
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.warn('RPC fn_record_penjualan gagal', err);
    return { success: false, error: err };
  }
}

// Local Storage Keys for offline persistence & instant sync
export const STORAGE_KEYS = {
  BARANG: 'pantau_stok_barang_v1',
  USERS: 'pantau_stok_users_v1',
  MUTASI: 'pantau_stok_mutasi_v1',
  PENJUALAN: 'pantau_stok_penjualan_v1',
  OPNAME: 'pantau_stok_opname_v1',
  PERMINTAAN_MUTASI: 'pantau_stok_permintaan_mutasi_v1',
  RETUR_STOK: 'pantau_stok_retur_stok_v1',
  ACTIVE_USER: 'pantau_stok_active_user_v1',
};
