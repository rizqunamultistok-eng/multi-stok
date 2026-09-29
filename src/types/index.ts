export type UserRole = 
  | 'admin' 
  | 'gudang' 
  | 'toko' 
  | 'reseller' 
  | 'online' 
  | 'cacat';

export type StockLocation = 'gudang' | 'toko' | 'reseller' | 'online' | 'cacat';

export type SalesStockLocation = 'toko' | 'reseller' | 'online' | 'cacat';

export function getCashierSalesLocation(role: UserRole): SalesStockLocation | null {
  switch (role) {
    case 'toko':
      return 'toko';
    case 'online':
      return 'online';
    case 'reseller':
      return 'reseller';
    case 'cacat':
      return 'cacat';
    default:
      return null;
  }
}

export function normalizeUserRole(role: string): UserRole {
  const legacyLocationByRole: Record<string, UserRole> = {
    kasir: 'toko',
    kasir_toko: 'toko',
    etalase: 'toko',
    kasir_online: 'online',
    kasir_reseller: 'reseller',
    kasir_cacat: 'cacat',
  };
  return legacyLocationByRole[role] || role as UserRole;
}

export function canUseCashier(role: UserRole): boolean {
  return getCashierSalesLocation(role) !== null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password?: string;
  active: boolean;
  avatar?: string;
  signature?: string;
  created_at?: string;
}

export function normalizeUserProfile(user: UserProfile & { shift?: unknown }): UserProfile {
  const normalized = { ...user, role: normalizeUserRole(user.role) } as UserProfile & { shift?: unknown };
  delete normalized.shift;
  return normalized;
}

export interface Barang {
  kodebarang: string; // Primary Key
  kodebarcode: string;
  namabarang: string;
  jenis: string;
  merek: string;
  satuan: string;
  hargapokok: number;
  hargajual: number;
  stok: number; // Total / current primary stock
  supplier: string;
  lokasi?: StockLocation | string;
  stok_lokasi?: Record<StockLocation, number>; // Read-only multi-location distribution
  min_stok?: number;
  updated_at?: string;
}

export interface MinimumStockSettings {
  defaultMinimum: number;
  categoryMinimums: Record<string, number>;
}

export interface Supplier {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  kontak: string;
  updated_at?: string;
}

export interface GoodsReceiptLine {
  id: string;
  nomor_faktur: string;
  kodebarang: string;
  namabarang: string;
  jumlah: number;
  satuan: string;
  hargapokok: number;
  hargajual: number;
  created_at: string;
}

export interface GoodsReceipt {
  nomor_faktur: string;
  supplier_kode?: string | null;
  supplier: string;
  tanggal: string;
  catatan?: string | null;
  total_baris: number;
  total_qty: number;
  created_by?: string | null;
  created_by_name: string;
  created_at: string;
  items: GoodsReceiptLine[];
}

export type RequestStatus = 'pending' | 'disetujui' | 'ditolak';

export interface PermintaanMutasi {
  id: string;
  nomor_permintaan: string; // e.g. REQ-20260814-001
  kodebarang: string;
  namabarang: string;
  asal_lokasi: StockLocation;
  tujuan_lokasi: StockLocation;
  jumlah_diminta: number;
  satuan: string;
  alasan?: string;
  status: RequestStatus;
  pemohon_id: string;
  pemohon_name: string;
  pemohon_role: UserRole;
  disetujui_oleh_id?: string;
  disetujui_oleh_name?: string;
  catatan_approval?: string;
  created_at: string;
  updated_at?: string;
}

export interface ReturStok {
  id: string;
  nomor_retur: string;
  kodebarang: string;
  namabarang: string;
  asal_lokasi: StockLocation;
  tujuan_lokasi: StockLocation | null;
  supplier: string | null;
  jumlah: number;
  satuan: string;
  alasan?: string;
  status: RequestStatus;
  pemohon_id: string;
  pemohon_name: string;
  pemohon_role: UserRole;
  disetujui_oleh_id?: string | null;
  disetujui_oleh_name?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface MutationRequestLine {
  kodebarang: string;
  jumlah_diminta: number;
}

export interface MutasiStok {
  id: string;
  kodebarang: string;
  namabarang?: string;
  stok_sebelum: number;
  stok_sesudah: number;
  perubahan: number;
  user_id: string;
  user_name?: string;
  tipe: 'barang_masuk' | 'opname' | 'penjualan' | 'retur' | 'pembatalan' | 'manual';
  lokasi_asal?: StockLocation | null;
  lokasi_tujuan?: StockLocation | null;
  jumlah_pergerakan?: number;
  stok_lokasi_sebelum?: number;
  stok_lokasi_sesudah?: number;
  stok_tujuan_sebelum?: number;
  stok_tujuan_sesudah?: number;
  referensi_tipe?: string;
  referensi_id?: string;
  keterangan: string;
  created_at: string;
}

export interface OpnameHistory {
  id: string;
  user_id: string;
  user_name: string;
  user_role?: UserRole;
  lokasi?: StockLocation;
  file_name: string;
  total_proses: number;
  total_sesuai: number;
  total_selisih: number;
  status: 'sukses' | 'parsial' | 'gagal';
  created_at: string;
  details?: {
    kodebarang: string;
    namabarang: string;
    stok_sistem: number;
    stok_fisik: number;
    selisih: number;
  }[];
}

export interface PenjualanHistory {
  id: string;
  transaction_id?: string;
  kodebarang: string;
  namabarang: string;
  jumlah_terjual: number;
  hargajual: number;
  total_nilai: number;
  user_id: string;
  user_name: string;
  shift?: string | null;
  lokasi?: SalesStockLocation | StockLocation | string;
  keterangan?: string;
  created_at: string;
}

export interface OpnamePreviewItem {
  kodebarang: string;
  stok_fisik: number;
  barang_exist?: Barang | null;
  status: 'valid' | 'tidak_ditemukan';
  selisih: number;
}

export interface KasirUploadPreviewItem {
  kodebarang: string;
  jumlah_terjual: number;
  namabarang: string;
  stok_sebelum: number;
  stok_sesudah: number;
  hargajual: number;
  total_nilai: number;
  status: 'valid' | 'tidak_ditemukan' | 'stok_kurang';
  error_message?: string;
}

export interface MasterUploadPreviewItem {
  kodebarang: string;
  kodebarcode: string;
  namabarang: string;
  jenis: string;
  merek: string;
  satuan: string;
  hargapokok: number;
  hargajual: number;
  stok: number;
  supplier: string;
  isUpdate: boolean;
  status: 'valid' | 'invalid';
  error_message?: string;
}
