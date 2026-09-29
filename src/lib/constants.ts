import { Barang, UserProfile, MutasiStok, PenjualanHistory, OpnameHistory, PermintaanMutasi } from '../types';

// Environment variables with fallback
const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
export const SUPABASE_URL = (metaEnv.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = (metaEnv.VITE_SUPABASE_ANON_KEY || '').trim();

export const INITIAL_USERS: UserProfile[] = [
  {
    id: 'usr-admin-01',
    email: 'admin@simponi-kharisma.my.id',
    name: 'Syaher Khofsoh (Admin)',
    role: 'admin',
    password: 'admin123',
    active: true,
    created_at: '2025-01-10T08:00:00Z',
  },
  {
    id: 'usr-gudang-01',
    email: 'gudang.utama@simponi-kharisma.my.id',
    name: 'Budi Santoso (Gudang)',
    role: 'gudang',
    password: '123456',
    active: true,
    created_at: '2025-01-11T08:00:00Z',
  },
  {
    id: 'usr-toko-01',
    email: 'toko.pusat@simponi-kharisma.my.id',
    name: 'Rian Hidayat (Toko)',
    role: 'toko',
    password: '123456',
    active: true,
    created_at: '2025-01-12T08:00:00Z',
  },
  {
    id: 'usr-etalase-01',
    email: 'etalase.depan@simponi-kharisma.my.id',
    name: 'Siti Rahma (Toko)',
    role: 'toko',
    password: '123456',
    active: true,
    created_at: '2025-01-13T08:00:00Z',
  },
  {
    id: 'usr-reseller-01',
    email: 'mitra.reseller@simponi-kharisma.my.id',
    name: 'Ahmad Reseller (Mitra)',
    role: 'reseller',
    password: '123456',
    active: true,
    created_at: '2025-01-14T08:00:00Z',
  },
  {
    id: 'usr-online-01',
    email: 'marketplace@simponi-kharisma.my.id',
    name: 'Dewi Online (Ecommerce)',
    role: 'online',
    password: '123456',
    active: true,
    created_at: '2025-01-15T08:00:00Z',
  },
  {
    id: 'usr-kasir-01',
    email: 'kasir.pagi@simponi-kharisma.my.id',
    name: 'Maya Putri (Kasir Pagi)',
    role: 'toko',
    password: '123456',
    active: true,
    created_at: '2025-01-16T08:00:00Z',
  },
  {
    id: 'usr-kasir-02',
    email: 'kasir.siang@simponi-kharisma.my.id',
    name: 'Doni Pratama (Kasir Siang)',
    role: 'toko',
    password: '123456',
    active: true,
    created_at: '2025-01-16T14:00:00Z',
  },
  {
    id: 'usr-kasir-03',
    email: 'kasir.malam@simponi-kharisma.my.id',
    name: 'Fikri Irawan (Kasir Malam)',
    role: 'toko',
    password: '123456',
    active: true,
    created_at: '2025-01-16T20:00:00Z',
  },
];

export const INITIAL_BARANG: Barang[] = [];

export const INITIAL_PENJUALAN: PenjualanHistory[] = [];

export const INITIAL_MUTASI: MutasiStok[] = [];

export const INITIAL_OPNAME_HISTORY: OpnameHistory[] = [];

export const INITIAL_PERMINTAAN_MUTASI: PermintaanMutasi[] = [];


