import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../api/client';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'PROCTOR';
}

interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = async () => {
    // Only check admin session if on admin URL or token exists
    const hasAdminToken = !!localStorage.getItem('fest_admin_token');
    const isAdminUrl = window.location.pathname.startsWith('/admin') || window.location.hash.includes('admin');
    if (!hasAdminToken && !isAdminUrl) {
      setAdmin(null);
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch<AdminUser>('/admin/auth/me');
      setAdmin(data);
    } catch {
      localStorage.removeItem('fest_admin_token');
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiFetch<AdminUser & { token?: string }>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.token) {
      localStorage.setItem('fest_admin_token', data.token);
    }
    setAdmin(data);
  };

  const logout = async () => {
    try {
      await apiFetch('/admin/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('fest_admin_token');
      setAdmin(null);
    }
  };

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  return ctx;
};
