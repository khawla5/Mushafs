import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useI18n } from '../i18n';

export type Role = 'admin' | 'supervisor' | 'production_manager' | 'mujiz' | 'technician' | 'reader' | 'reviewer' | 'mixing_lead';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone: string | null;
  roles: Role[];
  locale: 'ar' | 'en';
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  has: (...roles: Role[]) => boolean;
  isManagement: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLocale } = useI18n();

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: User }>('/auth/me');
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => setUser(null);
    window.addEventListener('mushafs:unauthorized', onUnauthorized);
    return () => window.removeEventListener('mushafs:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ user: User }>('/auth/login', { email, password });
    setUser(r.user);
    setLocale(r.user.locale);
  }, [setLocale]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
  }, []);

  const has = useCallback((...roles: Role[]) => !!user && user.roles.some((r) => roles.includes(r)), [user]);

  return (
    <Ctx.Provider value={{ user, loading, login, logout, refresh, has, isManagement: has('admin', 'supervisor', 'production_manager') }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
