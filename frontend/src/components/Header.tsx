import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogOut, GraduationCap } from 'lucide-react';

export const Header: React.FC = () => {
  const { participant, logout } = useAuth();

  return (
    <header className="w-full bg-slate-900 border-b border-slate-800 px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left: Academic & Fest Identity */}
        <div className="flex items-center space-x-3.5">
          <div className="w-9 h-9 rounded bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-300">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-wider text-blue-400 uppercase">
              Department of Artificial Intelligence & Machine Learning
            </div>
            <div className="text-sm font-bold text-slate-100 tracking-tight">
              Annual Technical Fest 2026 <span className="text-slate-500 font-normal">|</span> Competition Portal
            </div>
          </div>
        </div>

        {/* Right: Participant Info & Action */}
        {participant && (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded text-xs">
              <GraduationCap className="w-4 h-4 text-slate-400" />
              <div>
                <span className="font-mono font-medium text-slate-200">{participant.roll_number}</span>
                <span className="text-slate-500 mx-1.5">·</span>
                <span className="text-slate-300">{participant.name}</span>
                <span className="text-slate-500 mx-1.5">·</span>
                <span className="text-blue-400 font-medium">Year {participant.academic_year}</span>
              </div>
            </div>

            <button
              onClick={() => logout()}
              className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 py-1.5 rounded transition-colors"
              title="Sign out of current session"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
