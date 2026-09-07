import React, { useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';

interface Props {
  onSuccess: () => void;
}

export const AdminLoginPage: React.FC<Props> = ({ onSuccess }) => {
  const { login } = useAdminAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin2026');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      onSuccess();
    } catch (err: any) {
      setError(err?.detail || 'Invalid admin credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-4 font-sans text-[#1B2029]">
      <div className="w-full max-w-md bg-white border border-[#DBD7C9] rounded-[4px] p-8 shadow-sm">
        <div className="mb-6">
          <div className="inline-block px-2 py-0.5 bg-[#16233F] text-white text-[10px] font-mono tracking-wider uppercase rounded-[2px] mb-2">
            Operations & Control
          </div>
          <h1 className="text-xl font-bold text-[#16233F]">Admin Command Center</h1>
          <p className="text-xs text-[#59626F] mt-1">CodeFest 2026 · Department of CSE (AI &amp; ML)</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-[#FCEDEC] border border-[#F2B8B5] text-[#A82A2A] text-xs rounded-[3px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#16233F] uppercase tracking-wider mb-1">
              Admin Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 px-3 border border-[#C6C1B0] rounded-[3px] text-sm focus:outline-none focus:border-[#16233F]"
              placeholder="e.g. admin"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#16233F] uppercase tracking-wider mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 border border-[#C6C1B0] rounded-[3px] text-sm focus:outline-none focus:border-[#16233F]"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-[#16233F] text-white text-sm font-semibold rounded-[3px] hover:bg-[#25355B] transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {loading ? <span>Authenticating…</span> : <span>Enter Command Center →</span>}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#DBD7C9] text-center">
          <p className="text-[11px] text-[#8B93A0]">
            Authorized organizers only · Session activity is logged
          </p>
        </div>
      </div>
    </div>
  );
};
