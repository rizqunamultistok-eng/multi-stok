import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, normalizeUserProfile } from '../types';
import { INITIAL_USERS } from '../lib/constants';
import { STORAGE_KEYS } from '../lib/supabase';
import { fetchLoginOptions, syncUserToServer } from '../lib/localServer';
import { idbGet, idbSet } from '../lib/idbStorage';

const AUTH_LOGIN_STATE_KEY = 'pantau_auth_is_logged_in';

interface AuthContextType {
  currentUser: UserProfile;
  users: UserProfile[];
  loginUsersStatus: 'loading' | 'ready' | 'offline';
  loginUsersMessage: string;
  cloudUsersStatus: 'idle' | 'syncing' | 'synced' | 'pending' | 'error';
  cloudUsersMessage: string;
  isLoggedIn: boolean;
  setCurrentUser: (user: UserProfile) => void;
  login: (identifier: string, pass: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  changePassword: (userId: string, newPass: string) => { success: boolean; message?: string };
  switchRole: (role: UserRole) => void;
  addUser: (user: Omit<UserProfile, 'id' | 'created_at'> & { password?: string }) => void;
  updateUser: (id: string, updates: Partial<UserProfile>) => void;
  toggleUserActive: (id: string) => void;
  deleteUser: (id: string) => { success: boolean; message?: string };
  isAdmin: boolean;
  canAccessStock: boolean;
  canAccessOpname: boolean;
  canAccessBarcode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cloudUsersStatus, setCloudUsersStatus] = useState<'idle' | 'syncing' | 'synced' | 'pending' | 'error'>('idle');
  const [cloudUsersMessage, setCloudUsersMessage] = useState('');
  const [loginUsersStatus, setLoginUsersStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [loginUsersMessage, setLoginUsersMessage] = useState('Memuat nama akun...');
  const [isUserCacheLoaded, setIsUserCacheLoaded] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      if (saved) {
        const parsed: UserProfile[] = JSON.parse(saved);
        // Ensure default passwords exist on loaded users
        return parsed.map((u) => normalizeUserProfile({
          ...u,
          password: u.password || (u.role === 'admin' ? 'admin123' : '123456'),
        }));
      }
    } catch {
      // ignore
    }
    return INITIAL_USERS;
  });

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AUTH_LOGIN_STATE_KEY);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
      if (saved) {
        return normalizeUserProfile(JSON.parse(saved) as UserProfile & { shift?: unknown });
      }
    } catch {
      // ignore
    }
    return INITIAL_USERS[0]; // Default to Admin
  });

  useEffect(() => {
    let cancelled = false;
    let hasLocalUsers = false;
    try {
      hasLocalUsers = localStorage.getItem(STORAGE_KEYS.USERS) !== null;
    } catch {
      // IndexedDB remains available when localStorage is blocked.
    }
    if (hasLocalUsers) {
      setIsUserCacheLoaded(true);
      return () => {
        cancelled = true;
      };
    }
    void idbGet<UserProfile[]>(STORAGE_KEYS.USERS).then((cachedUsers) => {
      if (cancelled) return;
      if (cachedUsers?.length) {
        setUsers(cachedUsers.map((user) => normalizeUserProfile({
          ...user,
          password: user.password || (user.role === 'admin' ? 'admin123' : '123456'),
        })));
      }
      setIsUserCacheLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isUserCacheLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch {
      // ignore
    }
    void idbSet(STORAGE_KEYS.USERS, users);
  }, [users, isUserCacheLoaded]);

  useEffect(() => {
    if (!isUserCacheLoaded) return;
    let cancelled = false;
    void fetchLoginOptions().then((result) => {
      if (cancelled) return;
      if (!result.success || !result.users) {
        setLoginUsersStatus('offline');
        setLoginUsersMessage('Server/cloud tidak tersedia. Menggunakan daftar akun tersimpan di perangkat.');
        return;
      }

      setUsers((previous) => {
        const remoteIds = new Set(result.users!.map((user) => user.id));
        const cachedById = new Map<string, UserProfile>(
          previous.map((user): [string, UserProfile] => [user.id, user]),
        );
        const remoteUsers = result.users!.map((user) => {
          const cachedUser = cachedById.get(user.id);
          return normalizeUserProfile({
            ...cachedUser,
            ...user,
            password: cachedUser?.password,
          } as UserProfile & { shift?: unknown });
        });
        const cachedOnlyUsers = previous
          .filter((user) => !remoteIds.has(user.id))
          .map((user) => ({ ...user, active: false }));
        return [...remoteUsers, ...cachedOnlyUsers];
      });
      setLoginUsersStatus('ready');
      setLoginUsersMessage(`${result.users.length} akun aktif dimuat dari cloud/cache server.`);
    });
    return () => {
      cancelled = true;
    };
  }, [isUserCacheLoaded]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(currentUser));
    } catch {
      // ignore
    }
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTH_LOGIN_STATE_KEY, String(isLoggedIn));
    } catch {
      // ignore
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isUserCacheLoaded || !isLoggedIn || currentUser.role !== 'admin') return;
    let cancelled = false;
    setCloudUsersStatus('syncing');
    setCloudUsersMessage('Memuat akun dari cloud...');
    void syncUserToServer('list', {
      email: currentUser.email,
      password: currentUser.password || '',
    }).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setCloudUsersStatus('error');
        setCloudUsersMessage(result.message || 'Gagal memuat akun cloud.');
        return;
      }
      const cloudUsers = (result.users || []) as unknown as UserProfile[];
      if (cloudUsers.length > 0) {
        const normalizedUsers = cloudUsers.map((user) => normalizeUserProfile({
          ...user,
          password: user.password || (user.role === 'admin' ? 'admin123' : '123456'),
        }));
        setUsers(normalizedUsers);
        const cloudCurrentUser = normalizedUsers.find(
          (user) => user.email.toLowerCase() === currentUser.email.toLowerCase(),
        );
        if (cloudCurrentUser) setCurrentUser(cloudCurrentUser);
      }
      setCloudUsersStatus(result.cloudSynced === false ? 'pending' : 'synced');
      setCloudUsersMessage(
        result.message || (result.cloudSynced === false
          ? `${cloudUsers.length} akun dimuat dari cache server LAN; cloud menunggu sinkronisasi.`
          : `${cloudUsers.length} akun dimuat dari cloud.`),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isUserCacheLoaded, isLoggedIn, currentUser.role]);

  const syncCloudUser = async (
    action: 'upsert' | 'delete',
    user?: UserProfile,
  ) => {
    setCloudUsersStatus('syncing');
    setCloudUsersMessage('Menyimpan perubahan user ke cloud...');
    const result = await syncUserToServer(
      action,
      { email: currentUser.email, password: currentUser.password || '' },
      user as unknown as Record<string, unknown> | undefined,
      user?.id,
      user?.email,
    );
    if (!result.success) {
      setCloudUsersStatus('error');
      setCloudUsersMessage(result.message || 'Gagal menyinkronkan user ke cloud.');
      return;
    }
    if (result.user) {
      const savedUser = result.user as unknown as UserProfile;
      setUsers((previous) => previous.map((existing) =>
        existing.id === user?.id || existing.email.toLowerCase() === savedUser.email.toLowerCase()
          ? { ...existing, ...savedUser }
          : existing,
      ));
      if (currentUser.id === user?.id) {
        setCurrentUser((previous) => ({ ...previous, ...savedUser }));
      }
    }
    setCloudUsersStatus(result.cloudSynced === false ? 'pending' : 'synced');
    setCloudUsersMessage(result.message || (result.cloudSynced === false
      ? 'Perubahan user tersimpan di server LAN dan menunggu sinkronisasi cloud.'
      : 'Perubahan user berhasil disimpan ke cloud.'));
  };

  const login = async (
    identifier: string,
    pass: string
  ): Promise<{ success: boolean; message?: string }> => {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = pass.trim();

    const localUser = users.find(
      (u) =>
        u.active &&
        (u.id.toLowerCase() === cleanId ||
          u.email.toLowerCase() === cleanId ||
          u.role.toLowerCase() === cleanId ||
          u.name.toLowerCase() === cleanId)
    );
    const expectedPass = localUser?.password || (localUser?.role === 'admin' ? 'admin123' : '123456');
    const localCredentialsValid = Boolean(localUser && cleanPass === expectedPass);
    const serverResult = await syncUserToServer(
      'authenticate',
      { email: cleanId, password: cleanPass },
      undefined,
      undefined,
      undefined,
    );

    if (!serverResult.success && (serverResult.status === 400 || serverResult.status === 401)) {
      return { success: false, message: serverResult.message || 'Login gagal. Periksa akun dan password.' };
    }

    const authenticatedUser = serverResult.user
      ? normalizeUserProfile({
          ...(serverResult.user as unknown as UserProfile & { shift?: unknown }),
          password: cleanPass,
        })
      : localCredentialsValid
      ? localUser
      : undefined;
    if (!authenticatedUser) {
      return {
        success: false,
        message: serverResult.message || (localUser ? 'Password salah! Silakan coba lagi.' : 'Pengguna tidak ditemukan atau akun sedang dinonaktifkan.'),
      };
    }

    const userToSet = normalizeUserProfile(authenticatedUser);
    setUsers((previous) => {
      const index = previous.findIndex((user) => user.id === userToSet.id || user.email.toLowerCase() === userToSet.email.toLowerCase());
      if (index < 0) return [...previous, userToSet];
      return previous.map((user, userIndex) => userIndex === index ? { ...user, ...userToSet } : user);
    });
    setCurrentUser(userToSet);
    setIsLoggedIn(true);
    return { success: true };
  };

  const logout = () => {
    setIsLoggedIn(false);
  };

  const changePassword = (userId: string, newPass: string): { success: boolean; message?: string } => {
    if (!newPass || newPass.trim().length < 4) {
      return { success: false, message: 'Password minimal 4 karakter!' };
    }
    const cleanPass = newPass.trim();
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, password: cleanPass } : u))
    );
    const updatedUser = users.find((user) => user.id === userId);
    if (updatedUser) void syncCloudUser('upsert', { ...updatedUser, password: cleanPass });
    if (currentUser.id === userId) {
      setCurrentUser((prev) => ({ ...prev, password: cleanPass }));
    }
    return { success: true, message: 'Password berhasil diubah!' };
  };

  const switchRole = (role: UserRole) => {
    // Only Admin is allowed to switch roles directly without logging out
    if (currentUser.role !== 'admin') {
      console.warn('Hanya Admin yang dapat beralih role tanpa logout. Silakan logout terlebih dahulu.');
      return;
    }
    const found = users.find((u) => u.role === role);
    if (found) {
      setCurrentUser(found);
    } else {
      const tempUser: UserProfile = {
        id: `usr-${role}-${Date.now()}`,
        email: `${role}@simponi-kharisma.my.id`,
        name: `${role.toUpperCase()} User`,
        role,
        password: role === 'admin' ? 'admin123' : '123456',
        active: true,
        created_at: new Date().toISOString(),
      };
      setUsers((prev) => [...prev, tempUser]);
      setCurrentUser(tempUser);
    }
  };

  const addUser = (userData: Omit<UserProfile, 'id' | 'created_at'> & { password?: string }) => {
    const newUser: UserProfile = {
      ...userData,
      id: typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `usr-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      password: userData.password || (userData.role === 'admin' ? 'admin123' : '123456'),
      created_at: new Date().toISOString(),
    };
    setUsers((prev) => [...prev, newUser]);
    void syncCloudUser('upsert', newUser);
  };

  const updateUser = (id: string, updates: Partial<UserProfile>) => {
    const existingUser = users.find((user) => user.id === id);
    if (!existingUser) return;
    const updatedUser = { ...existingUser, ...updates };
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? updatedUser : u))
    );
    void syncCloudUser('upsert', updatedUser);
    if (currentUser.id === id) {
      setCurrentUser(updatedUser);
    }
  };

  const toggleUserActive = (id: string) => {
    const existingUser = users.find((user) => user.id === id);
    if (!existingUser) return;
    const updatedUser = { ...existingUser, active: !existingUser.active };
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? updatedUser : u))
    );
    void syncCloudUser('upsert', updatedUser);
  };

  const deleteUser = (id: string): { success: boolean; message?: string } => {
    if (currentUser.role !== 'admin') {
      return { success: false, message: 'Hanya Admin yang memiliki hak menghapus akun pengguna!' };
    }
    if (currentUser.id === id) {
      return { success: false, message: 'Anda tidak dapat menghapus akun Admin yang sedang Anda gunakan!' };
    }
    const target = users.find((u) => u.id === id);
    if (!target) {
      return { success: false, message: 'Pengguna tidak ditemukan!' };
    }

    setUsers((prev) => prev.filter((u) => u.id !== id));
    void syncCloudUser('delete', target);

    return { success: true, message: `Akun ${target.name} (${target.role}) berhasil dihapus permanen.` };
  };

  const isAdmin = currentUser.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        loginUsersStatus,
        loginUsersMessage,
        cloudUsersStatus,
        cloudUsersMessage,
        isLoggedIn,
        setCurrentUser,
        login,
        logout,
        changePassword,
        switchRole,
        addUser,
        updateUser,
        toggleUserActive,
        deleteUser,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
