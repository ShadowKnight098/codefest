import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Participant } from '../types/auth';
import { apiFetch } from '../api/client';

interface AuthContextType {
  participant: Participant | null;
  loading: boolean;
  login: (roll_number: string, email: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = async () => {
    // Only attempt refresh if a token or active session marker exists in storage
    const hasToken = !!localStorage.getItem('fest_token');
    const hasSession = localStorage.getItem('fest_has_session') === 'true';

    if (!hasToken && !hasSession) {
      setParticipant(null);
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch<Participant>('/api/auth/me');
      setParticipant(data);
    } catch {
      localStorage.removeItem('fest_token');
      localStorage.removeItem('fest_has_session');
      setParticipant(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (roll_number: string, email: string, pin: string) => {
    const data = await apiFetch<Participant>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ roll_number, email, pin }),
    });
    if (data.token) {
      localStorage.setItem('fest_token', data.token);
    }
    localStorage.setItem('fest_has_session', 'true');
    setParticipant(data);
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('fest_token');
      localStorage.removeItem('fest_has_session');
      setParticipant(null);
    }
  };

  return (
    <AuthContext.Provider value={{ participant, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
