import React, { useState } from 'react';
import { 
  Volume2, 
  Database, 
  RefreshCw, 
  UserCheck, 
  ChevronDown, 
  CheckCircle2,
  AlertCircle,
  LogOut,
  KeyRound,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { sound } from '../../lib/sound';
import { Badge } from '../common/Badge';
import { UserRole } from '../../types';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { ROLE_THEME } from '../../lib/locationTheme';

interface NavbarProps {
  isSidebarOpen: boolean;
  onMenuToggle: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ isSidebarOpen, onMenuToggle }) => {
  const { currentUser, switchRole, logout, isAdmin } = useAuth();
  const { isDbConnected, dbStatusMsg, refreshData, isLoading } = useInventory();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const activeRoleTheme = ROLE_THEME[currentUser.role];

  const testAudio = () => {
    sound.playScannerBeep();
    setTimeout(() => {
      sound.playSuccessChime();
    }, 250);
  };

  const roleOptions: { role: UserRole; label: string; desc: string }[] = [
    { role: 'admin', label: 'Admin Utama', desc: 'Full CRUD, User Mgmt, All Sales' },
    { role: 'gudang', label: 'Staff Gudang', desc: 'Cek Stok, Opname, Transfer, Scan' },
    { role: 'toko', label: 'Staff Toko', desc: 'Cek Stok, Opname, Request, Scan' },
    { role: 'reseller', label: 'Mitra Reseller', desc: 'Cek Stok Reseller, Opname, Scan' },
    { role: 'online', label: 'Tim Online/E-com', desc: 'Cek Stok Online, Opname, Scan' },
    { role: 'cacat', label: 'Petugas Barang Cacat', desc: 'Cek Stok Barang Cacat, Opname, Scan' },
  ];

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-2xs sm:h-16 sm:px-8">
      {/* Brand Logo & Name */}
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-label={isSidebarOpen ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={isSidebarOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 md:hidden"
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <img src="/icon.jpg" alt="Logo" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        <div>
          <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-bold text-slate-900 tracking-tight sm:text-lg">
              Pantau Stok
            </span>
            <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">
              Bento Edition
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium hidden md:block">
            Rizquna Multi-Channel System
          </p>
        </div>
      </div>

      {/* Supabase Status, Audio Test & Role Switcher */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-4">
        {/* Supabase Status Pill */}
        <div
          title={dbStatusMsg}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border bg-slate-50 border-slate-200 text-slate-700 cursor-help"
        >
          <Database className="w-3.5 h-3.5 text-indigo-600" />
          <span className="hidden lg:inline text-slate-500">Database:</span>
          {isDbConnected ? (
            <span className="flex items-center gap-1 text-emerald-600 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-600 font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Syncing
            </span>
          )}
        </div>

        {/* Sync Button */}
        <button
          onClick={refreshData}
          disabled={isLoading}
          title="Sinkronisasi Data"
          aria-label="Sinkronisasi Data"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 sm:rounded-full"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
        </button>

        {/* Audio Test Button */}
        <button
          onClick={testAudio}
          title="Uji Suara Beep Barcode"
          className="hidden cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 sm:flex"
        >
          <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
          <span className="hidden sm:inline">Uji Beep</span>
        </button>

        {/* In-App PWA Install Button */}
        <PWAInstallButton variant="nav" />

        {/* Active User & Role Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            className="flex items-center gap-2.5 p-1.5 sm:px-3 sm:py-1.5 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs ${activeRoleTheme.idleIcon}`}>
              {currentUser.name.charAt(0)}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                Role: <span className={`px-1.5 py-0.5 rounded-md border ${activeRoleTheme.idleIcon} ${activeRoleTheme.card}`}>{currentUser.role}</span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {/* Role Switcher Menu */}
          {roleDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setRoleDropdownOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white py-2 shadow-xl animate-in fade-in zoom-in-95 duration-100 sm:rounded-3xl">
                {isAdmin ? (
                  <>
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Mode Admin: Simulasi Role</span>
                        <Badge variant="purple" size="sm">Admin Only</Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Admin dapat beralih tampilan role untuk memverifikasi hak akses.
                      </p>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
                      {roleOptions.map((opt, i) => {
                        const isSelected = currentUser.role === opt.role;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              switchRole(opt.role);
                              setRoleDropdownOpen(false);
                              sound.playScannerBeep();
                            }}
                            className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between transition-colors ${
                              isSelected ? 'bg-indigo-50 text-indigo-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5 text-xs font-semibold">
                                {opt.label}
                              </div>
                              <div className="text-[10px] text-slate-500 font-normal">{opt.desc}</div>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Profil Akun Aktif</span>
                      <Badge variant="warning" size="sm">Terkunci</Badge>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1 text-xs">
                      <div className="font-bold text-slate-900">{currentUser.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{currentUser.email}</div>
                      <div className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider mt-1">
                        Saluran: {currentUser.role}
                      </div>
                    </div>
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-relaxed">
                      Sesuai SOP keamanan, Anda tidak dapat langsung beralih ke peran lain. Silakan <strong>Logout</strong> jika ingin berganti akun.
                    </div>
                  </div>
                )}

                <div className="pt-2 mt-1 border-t border-slate-100 px-2 pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRoleDropdownOpen(false);
                      logout();
                    }}
                    className="w-full px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Keluar Akun (Logout)</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Logout Button on Navbar */}
        <button
          type="button"
          onClick={logout}
          title="Keluar dari Akun"
          className="hidden cursor-pointer rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 sm:block"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
