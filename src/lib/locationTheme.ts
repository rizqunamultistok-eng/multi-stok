import { StockLocation, UserRole } from '../types';

export const ROLE_THEME: Record<UserRole, {
  card: string;
  selectedCard: string;
  idleCard: string;
  selectedIcon: string;
  idleIcon: string;
}> = {
  admin: {
    card: 'border-teal-200',
    selectedCard: 'bg-teal-700 border-teal-600 text-white shadow-lg shadow-teal-900/15 ring-2 ring-teal-500/30',
    idleCard: 'bg-teal-50 text-teal-950 hover:bg-teal-100',
    selectedIcon: 'bg-white/15 text-white',
    idleIcon: 'bg-teal-100 text-teal-700',
  },
  gudang: {
    card: 'border-blue-200',
    selectedCard: 'bg-blue-700 border-blue-600 text-white shadow-lg shadow-blue-900/15 ring-2 ring-blue-500/30',
    idleCard: 'bg-blue-50 text-blue-950 hover:bg-blue-100',
    selectedIcon: 'bg-white/15 text-white',
    idleIcon: 'bg-blue-100 text-blue-700',
  },
  toko: {
    card: 'border-teal-200',
    selectedCard: 'bg-teal-700 border-teal-600 text-white shadow-lg shadow-teal-900/15 ring-2 ring-teal-500/30',
    idleCard: 'bg-teal-50 text-teal-950 hover:bg-teal-100',
    selectedIcon: 'bg-white/15 text-white',
    idleIcon: 'bg-teal-100 text-teal-700',
  },
  reseller: {
    card: 'border-amber-200',
    selectedCard: 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/15 ring-2 ring-amber-400/30',
    idleCard: 'bg-amber-50 text-amber-950 hover:bg-amber-100',
    selectedIcon: 'bg-white/15 text-white',
    idleIcon: 'bg-amber-100 text-amber-700',
  },
  online: {
    card: 'border-violet-200',
    selectedCard: 'bg-violet-700 border-violet-600 text-white shadow-lg shadow-violet-900/15 ring-2 ring-violet-500/30',
    idleCard: 'bg-violet-50 text-violet-950 hover:bg-violet-100',
    selectedIcon: 'bg-white/15 text-white',
    idleIcon: 'bg-violet-100 text-violet-700',
  },
  cacat: {
    card: 'border-rose-200',
    selectedCard: 'bg-rose-700 border-rose-600 text-white shadow-lg shadow-rose-900/15 ring-2 ring-rose-500/30',
    idleCard: 'bg-rose-50 text-rose-950 hover:bg-rose-100',
    selectedIcon: 'bg-white/15 text-white',
    idleIcon: 'bg-rose-100 text-rose-700',
  },
};

export const LOCATION_THEME: Record<StockLocation, {
  softBg: string;
  text: string;
  border: string;
  active: string;
  tableBg: string;
  hex: string;
}> = {
  gudang: {
    softBg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200',
    active: 'bg-blue-700 text-white border-blue-700', tableBg: 'bg-blue-50/60', hex: '#2563eb',
  },
  toko: {
    softBg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200',
    active: 'bg-teal-700 text-white border-teal-700', tableBg: 'bg-teal-50/60', hex: '#0f766e',
  },
  reseller: {
    softBg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200',
    active: 'bg-amber-600 text-white border-amber-600', tableBg: 'bg-amber-50/60', hex: '#d97706',
  },
  online: {
    softBg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200',
    active: 'bg-violet-700 text-white border-violet-700', tableBg: 'bg-violet-50/60', hex: '#7c3aed',
  },
  cacat: {
    softBg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200',
    active: 'bg-rose-700 text-white border-rose-700', tableBg: 'bg-rose-50/60', hex: '#be123c',
  },
};