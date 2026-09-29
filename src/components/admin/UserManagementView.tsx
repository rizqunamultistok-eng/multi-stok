import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Edit2, 
  Trash2,
  AlertTriangle,
  CheckCircle2, 
  XCircle, 
  Shield, 
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, UserRole, canUseCashier } from '../../types';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';

export const UserManagementView: React.FC = () => {
  const {
    users,
    addUser,
    updateUser,
    toggleUserActive,
    currentUser,
    changePassword,
    deleteUser,
    cloudUsersStatus,
    cloudUsersMessage,
  } = useAuth();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [deleteStatusMsg, setDeleteStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('toko');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signature, setSignature] = useState('');

  // Password Modal State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error' | null; text: string }>({
    type: null,
    text: '',
  });

  const handleOpenAdd = () => {
    setName('');
    setEmail('');
    setRole('toko');
    setPassword('123456');
    setShowPassword(false);
    setSignature('');
    setIsAddOpen(true);
  };

  const handleOpenEdit = (user: UserProfile) => {
    setActiveUser(user);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setPassword(user.password || (user.role === 'admin' ? 'admin123' : '123456'));
    setShowPassword(false);
    setSignature(user.signature || '');
    setIsEditOpen(true);
  };

  const handleOpenPasswordModal = (user: UserProfile) => {
    setActiveUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordMsg({ type: null, text: '' });
    setIsPasswordModalOpen(true);
  };

  const handleOpenDeleteModal = (user: UserProfile) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!userToDelete) return;
    const res = deleteUser(userToDelete.id);
    if (res.success) {
      setDeleteStatusMsg({ type: 'success', text: res.message || 'Pengguna berhasil dihapus.' });
      setTimeout(() => setDeleteStatusMsg(null), 4000);
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    } else {
      setDeleteStatusMsg({ type: 'error', text: res.message || 'Gagal menghapus pengguna.' });
    }
  };

  const handleSignatureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setSignature(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    addUser({
      name,
      email,
      role,
      password: password.trim() || (role === 'admin' ? 'admin123' : '123456'),
      signature,
      active: true,
    });
    setIsAddOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;

    updateUser(activeUser.id, {
      name,
      email,
      role,
      password: password.trim() || activeUser.password,
      signature,
    });
    setIsEditOpen(false);
  };

  const handleSaveNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;

    if (!newPassword || newPassword.length < 4) {
      setPasswordMsg({ type: 'error', text: 'Password minimal 4 karakter!' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Konfirmasi password tidak cocok!' });
      return;
    }

    const res = changePassword(activeUser.id, newPassword);
    if (res.success) {
      setPasswordMsg({
        type: 'success',
        text: `Password untuk ${activeUser.name} berhasil diperbarui menjadi "${newPassword}"!`,
      });
      setTimeout(() => {
        setIsPasswordModalOpen(false);
      }, 1500);
    } else {
      setPasswordMsg({ type: 'error', text: res.message || 'Gagal mengubah password' });
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            Kelola Pengguna & Hak Akses
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Atur hak akses per lokasi dan kelola password masing-masing akun
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Tambah Pengguna Baru
        </button>
      </div>

      {cloudUsersStatus !== 'idle' && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl text-xs border ${
            cloudUsersStatus === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : cloudUsersStatus === 'synced'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : cloudUsersStatus === 'pending'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          {cloudUsersMessage}
        </div>
      )}

      {/* Alert Status Hapus */}
      {deleteStatusMsg && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 ${
            deleteStatusMsg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          {deleteStatusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{deleteStatusMsg.text}</span>
        </div>
      )}

      {/* Quick Security Tips Banner */}
      <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold">Keamanan Akun & Password Default</div>
            <div className="text-[11px] text-amber-800/80">
              Admin default: <code className="font-mono bg-amber-100 px-1 py-0.5 rounded font-bold">admin123</code> • Staff lain default: <code className="font-mono bg-amber-100 px-1 py-0.5 rounded font-bold">123456</code>. Klik tombol kunci pada tabel untuk mereset atau mengganti password user.
            </div>
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5">Nama & Email</th>
                <th className="py-3 px-3.5">Peran / Role</th>
                <th className="py-3 px-3.5">Password Akun</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5">Dibuat</th>
                <th className="py-3 px-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => {
                const isMe = user.id === currentUser.id;
                const userPass = user.password || (user.role === 'admin' ? 'admin123' : '123456');

                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                            {user.name}
                            {isMe && <span className="text-[10px] text-indigo-600 font-bold">(Anda)</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3.5">
                      <Badge
                        size="md"
                        variant={
                          user.role === 'admin'
                            ? 'purple'
                            : canUseCashier(user.role)
                            ? 'warning'
                            : user.role === 'gudang'
                            ? 'primary'
                            : 'info'
                        }
                      >
                        <Shield className="w-3 h-3" />
                        {user.role.toUpperCase()}
                      </Badge>
                    </td>
                    {/* Password display & change */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] bg-slate-100 px-2 py-1 rounded-lg text-slate-700 font-bold">
                          {userPass}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenPasswordModal(user)}
                          title="Ganti Password Pengguna"
                          className="px-2 py-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          Ganti
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-3.5 text-center">
                      <button
                        onClick={() => toggleUserActive(user.id)}
                        disabled={isMe}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                          user.active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {user.active ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Aktif
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-slate-400" /> Nonaktif
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-3.5 text-slate-500 text-[11px]">
                      {user.created_at
                        ? new Date(user.created_at).toLocaleDateString('id-ID', {
                            dateStyle: 'medium',
                          })
                        : '-'}
                    </td>
                    <td className="py-3 px-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
                          title="Edit Profil User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenDeleteModal(user)}
                          disabled={isMe}
                          className={`p-1.5 rounded-xl transition-colors ${
                            isMe
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                          }`}
                          title={isMe ? 'Tidak bisa menghapus akun sendiri' : 'Hapus Akun Pengguna'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit User */}
      <Modal
        isOpen={isAddOpen || isEditOpen}
        onClose={() => {
          setIsAddOpen(false);
          setIsEditOpen(false);
        }}
        title={isAddOpen ? 'Tambah Pengguna Baru' : 'Edit Pengguna'}
        subtitle="Kelola penugasan peran dan password"
        maxWidth="md"
      >
        <form onSubmit={isAddOpen ? handleSaveAdd : handleSaveEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Rina Kasir Pagi"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Pengguna</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@simponi-kharisma.my.id"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password Akun</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 4 karakter..."
                className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tanda Tangan Nota</label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleSignatureChange}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
            />
            <p className="mt-1 text-[11px] text-slate-400">Upload gambar tanda tangan untuk dicetak otomatis pada nota.</p>
            {signature && <img src={signature} alt="Preview tanda tangan" className="mt-2 h-12 max-w-48 object-contain border border-slate-200 rounded-lg bg-white" />}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Peran / Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="admin">Admin (Full Access CRUD)</option>
              <option value="gudang">Gudang (Cek Stok, Opname, Transfer, Scan)</option>
              <option value="toko">Toko (Cek Stok, Opname, Request, Scan)</option>
              <option value="reseller">Reseller (Cek Stok, Opname, Scan)</option>
              <option value="online">Online / E-Commerce (Cek Stok, Opname, Scan)</option>
              <option value="cacat">Barang Cacat (Cek Stok, Opname, Scan)</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setIsAddOpen(false);
                setIsEditOpen(false);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs cursor-pointer"
            >
              Simpan Pengguna
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Ganti Password Cepat */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title={`Ganti Password: ${activeUser?.name}`}
        subtitle={`Role: ${activeUser?.role.toUpperCase()} • ${activeUser?.email}`}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveNewPassword} className="space-y-4">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-xs space-y-1">
            <div className="font-bold text-indigo-950 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              <span>Password Baru Pengguna</span>
            </div>
            <p className="text-indigo-800 text-[11px]">
              Admin dapat mengatur ulang password untuk akun ini secara langsung.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Password Baru</label>
            <input
              type="text"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Masukkan password baru..."
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Ulangi Password Baru</label>
            <input
              type="text"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ketik ulang password baru..."
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {passwordMsg.text && (
            <div
              className={`p-3 rounded-xl text-xs font-medium ${
                passwordMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {passwordMsg.text}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl cursor-pointer shadow-xs"
            >
              Simpan Password Baru
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Pengguna */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setUserToDelete(null);
        }}
        title="Konfirmasi Hapus Akun Pengguna"
        subtitle="Tindakan ini permanen dan akan menghapus akses pengguna dari sistem"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-900 text-xs">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-800">
                Peringatan: Akun akan dihapus secara permanen!
              </p>
              <p className="text-rose-700 mt-1 leading-relaxed">
                Apakah Anda yakin ingin menghapus akun pengguna berikut?
              </p>
            </div>
          </div>

          {userToDelete && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Nama Pengguna:</span>
                <span className="font-bold text-slate-900">{userToDelete.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Email / ID:</span>
                <span className="font-mono text-slate-800">{userToDelete.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Peran / Saluran:</span>
                <span className="font-bold uppercase text-indigo-700">{userToDelete.role}</span>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setUserToDelete(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Ya, Hapus Akun Ini</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
