'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AccountUser } from '@/lib/types';
const Context = createContext<{ user: AccountUser | null; loading: boolean; refreshUser: () => Promise<void>; logout: () => Promise<void> } | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null), [loading, setLoading] = useState(true);
  const refreshUser = useCallback(async () => {
    try { const response = await fetch('/api/auth/me', { cache: 'no-store' }); setUser(response.ok ? (await response.json()).user : null); }
    catch { setUser(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshUser(); const onFocus = () => { void refreshUser(); }; window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus); }, [refreshUser]);
  const logout = useCallback(async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
    setUser(null);
  }, []);
  return <Context.Provider value={{ user, loading, refreshUser, logout }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider missing'); return value; }
