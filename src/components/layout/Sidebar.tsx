import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ClipboardCheck, 
  TrendingUp, 
  Users, 
  Code2, 
  Layers,
  ArrowRightLeft,
  ShoppingCart,
  BellRing,
  Network,
  SlidersHorizontal,
  Building2,
  ReceiptText
  ,Undo2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { countUniqueMutationRequests, useInventory } from '../../context/InventoryContext';
import { Badge } from '../common/Badge';
import { canUseCashier } from '../../types';
import { ROLE_THEME } from '../../lib/locationTheme';

export type ActiveTab = 
  | 'kasir_dashboard'
  | 'kasir_history'
  | 'admin_dashboard'
  | 'master_barang'
  | 'barang_masuk'
  | 'retur_stok'
  | 'cek_stok'
  | 'permintaan_mutasi'
  | 'scan_barcode'
  | 'upload_opname'
  | 'laporan_penjualan'
  | 'kelola_user'
  | 'minimum_stock_settings'
  | 'supplier_data'
  | 'mutasi_stok'
  | 'server_topology'
  | 'sql_deployment';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, onClose }) => {
  const { currentUser, isAdmin } = useAuth();
  const cashierAvailable = canUseCashier(currentUser.role);
  const { pendingApprovalCount, permintaanMutasiList, opnameEnabled } = useInventory();
  const activeRoleTheme = ROLE_THEME[currentUser.role];

  // Calculate notifications strictly relevant to this user's role
  // Admin: sees count of ALL pending mutations
  // Other roles: only count mutations where user's role is origin (they need to approve/dispatch) OR destination
  const roleRelevantPendingCount = countUniqueMutationRequests(permintaanMutasiList.filter((r) => {
    if (r.status !== 'pending') return false;
    if (isAdmin) return true;
    return r.asal_lokasi === currentUser.role || r.tujuan_lokasi === currentUser.role;
  }));

  const needApprovalByRoleCount = countUniqueMutationRequests(permintaanMutasiList.filter((r) => {
    if (r.status !== 'pending') return false;
    if (isAdmin) return true;
    return r.asal_lokasi === currentUser.role;
  }));

  // Navigation Items for Admin & Location Roles
  const generalNavItems: { 
    id: ActiveTab; 
    label: string; 
    icon: React.ElementType; 
    adminOnly?: boolean;
    returnLocationOnly?: boolean;
    warehouseOnly?: boolean;
    cashierOnly?: boolean;
    badgeCount?: number;
    badgeVariant?: 'danger' | 'warning' | 'primary';
  }[] = [
    { id: 'admin_dashboard', label: 'Dashboard Sinkronisasi Stok', icon: LayoutDashboard, adminOnly: true },
    { id: 'master_barang', label: 'Master Data & SKU', icon: Package, adminOnly: true },
    { id: 'kasir_dashboard', label: 'Kasir', icon: ShoppingCart, cashierOnly: true },
    { id: 'cek_stok', label: 'Alokasi Stok Multi-Saluran', icon: Layers },
    { 
      id: 'permintaan_mutasi', 
      label: 'Permintaan Mutasi & Notif', 
      icon: BellRing,
      badgeCount: isAdmin
        ? (pendingApprovalCount > 0 ? pendingApprovalCount : undefined)
        : (roleRelevantPendingCount > 0 ? roleRelevantPendingCount : undefined),
      badgeVariant: needApprovalByRoleCount > 0 ? 'warning' : 'primary'
    },
    { id: 'barang_masuk', label: 'Barang Masuk (Faktur)', icon: ReceiptText, warehouseOnly: true },
    { id: 'retur_stok', label: 'Retur Stok', icon: Undo2, returnLocationOnly: true },
    { id: 'supplier_data', label: 'Data Supplier', icon: Building2, adminOnly: true },
    { id: 'upload_opname', label: 'Stock Opname & Rekonsiliasi', icon: ClipboardCheck },
    { id: 'mutasi_stok', label: 'Log Mutasi & Sinkronisasi', icon: ArrowRightLeft },
    { id: 'laporan_penjualan', label: 'Log Transaksi Kasir', icon: TrendingUp, adminOnly: true },
    { id: 'kelola_user', label: 'Kelola Hak Akses Saluran', icon: Users, adminOnly: true },
    { id: 'minimum_stock_settings', label: 'Batas Minimum Stok', icon: SlidersHorizontal, adminOnly: true },
    { id: 'server_topology', label: 'Setup 5 PC & HP (PWA)', icon: Network, adminOnly: true },
    { id: 'sql_deployment', label: 'Koneksi Supabase & API', icon: Code2, adminOnly: true },
  ];

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={onClose}
          className="fixed inset-x-0 top-14 bottom-0 z-20 bg-slate-950/45 backdrop-blur-[2px] md:hidden"
        />
      )}
      <aside className={`fixed left-0 top-14 bottom-0 z-30 flex w-72 max-w-[88vw] shrink-0 flex-col border-r border-slate-200 bg-white text-slate-700 shadow-2xl transition-transform duration-200 md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 md:shadow-none md:transition-none md:min-h-[calc(100vh-4rem)] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Role Badge Banner */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/60">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Akses Saluran
          </span>
          <Badge
            size="sm"
            className={`${activeRoleTheme.idleIcon} ${activeRoleTheme.card}`}
          >
            {currentUser.role.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              {isAdmin ? 'Menu Administrasi & Gudang' : `Menu Saluran ${currentUser.role.toUpperCase()}`}
            </div>
            {generalNavItems
              .filter((item) => (!item.adminOnly || isAdmin) && (!item.warehouseOnly || isAdmin || currentUser.role === 'gudang') && (!item.returnLocationOnly || isAdmin || ['toko', 'online', 'gudang', 'cacat', 'reseller'].includes(currentUser.role)) && (!item.cashierOnly || cashierAvailable) && (item.id !== 'upload_opname' || opnameEnabled || isAdmin))
              .map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-full flex items-center gap-1 ${
                        item.badgeVariant === 'warning'
                          ? 'bg-amber-500 text-white animate-pulse'
                          : 'bg-indigo-600 text-white'
                      }`}>
                        {item.badgeCount}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
      </nav>

      {/* Footer Info Profile Card (Bento Style) */}
      <div className="p-3 border-t border-slate-100">
        <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-100 rounded-2xl">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${activeRoleTheme.idleIcon}`}>
            {currentUser.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 truncate">{currentUser.name}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold truncate">
              {currentUser.role}
            </p>
          </div>
        </div>
      </div>
      </aside>
    </>
  );
};
