import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  User, 
  KeyRound, 
  Store, 
  Building2, 
  Users2, 
  Globe, 
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { ROLE_THEME } from '../../lib/locationTheme';

export const LoginView: React.FC = () => {
  const { users, login, loginUsersStatus, loginUsersMessage } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const roleCards: { 
    role: UserRole; 
    label: string; 
    subtitle: string; 
    icon: React.ElementType; 
  }[] = [
    {
      role: 'admin',
      label: 'Admin / Owner',
      subtitle: 'Akses Penuh Seluruh Sistem & Keuangan',
      icon: ShieldCheck,
    },
    {
      role: 'gudang',
      label: 'Gudang Utama',
      subtitle: 'Stock Opname Excel, Barcode & Mutasi',
      icon: Building2,
    },
    {
      role: 'toko',
      label: 'Toko Pusat',
      subtitle: 'Permintaan Stok Multi-Saluran',
      icon: Store,
    },
    {
      role: 'reseller',
      label: 'Mitra Reseller',
      subtitle: 'Alokasi Stok Konsinyasi Reseller',
      icon: Users2,
    },
    {
      role: 'online',
      label: 'Online / E-Com',
      subtitle: 'Stok Marketplace & Penjualan Online',
      icon: Globe,
    },
    {
      role: 'cacat',
      label: 'Barang Cacat',
      subtitle: 'Kelola Stok, Opname & Mutasi Barang Cacat',
      icon: ShieldAlert,
    },
  ];

  const currentRoleInfo = roleCards.find((r) => r.role === selectedRole)!;

  const availableUsers = users
    .filter((user) => user.active && user.role === selectedRole)
    .sort((first, second) => first.name.localeCompare(second.name));
  const targetUser = availableUsers.find((user) => user.id === selectedUserId);

  useEffect(() => {
    if (!availableUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(availableUsers[0]?.id || '');
    }
  }, [selectedRole, selectedUserId, users]);

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
    setSelectedUserId('');
    setErrorMessage('');
    setPassword('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (loginUsersStatus === 'loading') return;

    if (!password) {
      setErrorMessage('Silakan masukkan password akun Anda!');
      return;
    }
    if (!targetUser) {
      setErrorMessage('Belum ada akun aktif untuk peran/shift ini. Muat ulang daftar akun atau hubungi Admin.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(targetUser.id, password);
      if (!result.success) {
        setErrorMessage(result.message || 'Login gagal! Periksa kembali password Anda.');
      } else {
        setSuccessMessage('Login berhasil! Mengalihkan ke sistem...');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center relative z-10 space-y-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
          <img src="/icon.jpg" alt="Logo" className="h-7 w-7 rounded-full object-cover" />
          <span>Sistem Pantau Stok & POS Multi-Saluran</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Login Peran
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Silakan pilih peran kerja Anda di toko, lalu masukkan password rahasia akun untuk mengakses sistem.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-3xl relative z-10">
        <div className="bg-slate-950/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* 1. Pilih Role Grid */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2.5">
              1. Pilih Peran / Saluran Anda:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {roleCards.map((rc) => {
                const Icon = rc.icon;
                const isSelected = selectedRole === rc.role;
                const roleTheme = ROLE_THEME[rc.role];
                return (
                  <button
                    key={rc.role}
                    type="button"
                    onClick={() => handleSelectRole(rc.role)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${roleTheme.card} ${isSelected ? roleTheme.selectedCard : roleTheme.idleCard}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-xl ${isSelected ? roleTheme.selectedIcon : roleTheme.idleIcon}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400" />
                      )}
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${isSelected ? 'text-white' : ''}`}>
                        {rc.label}
                      </div>
                      <div className={`text-[10px] line-clamp-1 mt-0.5 ${isSelected ? 'text-white/75' : 'text-slate-600'}`}>
                        {rc.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Form Login & Password */}
          <form onSubmit={handleLoginSubmit} className="space-y-4 pt-2 border-t border-slate-800">
            <div className="space-y-1.5">
              <label htmlFor="login-user" className="block text-xs font-bold text-slate-300">
                Pilih Nama Pengguna:
              </label>
              <select
                id="login-user"
                value={targetUser?.id || ''}
                onChange={(event) => setSelectedUserId(event.target.value)}
                disabled={availableUsers.length === 0}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:text-slate-500"
              >
                {availableUsers.length === 0 ? (
                  <option value="">Tidak ada akun aktif untuk role ini</option>
                ) : availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              {loginUsersStatus !== 'ready' && (
                <p className="text-[11px] text-slate-400" role="status">{loginUsersMessage}</p>
              )}
            </div>

            {/* Selected User Info Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-white font-bold">
                    {targetUser?.name || `${currentRoleInfo.label} User`}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {targetUser?.email || 'Akun terdaftar'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Role: {selectedRole.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Password Input (No default password display or autofill button) */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300 flex items-center gap-1.5 text-xs">
                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Password Akun:</span>
              </label>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Masukkan password rahasia akun...`}
                  autoFocus
                  autoComplete="current-password"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition pr-11 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Alerts */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Login Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !targetUser || loginUsersStatus === 'loading'}
              className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-sm transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {loginUsersStatus === 'loading'
                  ? 'Memuat daftar akun...'
                  : isSubmitting
                  ? 'Memverifikasi akun...'
                  : `Masuk Sebagai ${currentRoleInfo.label}`}
              </span>
            </button>
          </form>

          {/* Clean Security Policy Note (NO default passwords exposed) */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-300 block">Kebijakan Keamanan Akun:</span>
              <p className="leading-relaxed">
                Setiap staf login menggunakan kredensial yang telah didaftarkan. Pengguna tidak dapat berpindah peran secara bebas tanpa melakukan <strong>Logout</strong> terlebih dahulu. Password dapat dikelola atau di-reset oleh Administrator di menu <em>Kelola Hak Akses Saluran</em>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
