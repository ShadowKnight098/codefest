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
    try {
      const data = await apiFetch<Participant>('/api/auth/me');
      setParticipant(data);
    } catch {
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
    setParticipant(data);
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
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
