import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MCQPage } from './pages/MCQPage';
import { WaitingPage } from './pages/WaitingPage';
import { CodingPage } from './pages/CodingPage';
import { TerminationPage } from './pages/TerminationPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

type ViewMode = 'dashboard' | 'mcq' | 'waiting' | 'coding' | 'termination' | 'admin_login' | 'admin_dashboard';

const AppContent: React.FC = () => {
  const { participant, loading: participantLoading } = useAuth();
  const { admin, loading: adminLoading } = useAdminAuth();
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');

  // Check URL hash or path for direct admin entry
  React.useEffect(() => {
    const handleUrlChange = () => {
      if (window.location.pathname.startsWith('/admin') || window.location.hash.includes('admin')) {
        setCurrentView('admin_login');
      } else if (currentView === 'admin_login' || currentView === 'admin_dashboard') {
        setCurrentView('dashboard');
      }
    };
    handleUrlChange();
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [currentView]);

  if (participantLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center text-[#59626F] text-[14px]">
        <div className="flex items-center space-x-2.5">
          <svg className="animate-spin h-4 w-4 text-[#16233F]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-medium">Validating session…</span>
        </div>
      </div>
    );
  }

  // Admin routing branch
  if (currentView === 'admin_login') {
    if (admin) {
      return <AdminDashboardPage onLogout={() => setCurrentView('admin_login')} />;
    }
    return <AdminLoginPage onSuccess={() => setCurrentView('admin_dashboard')} />;
  }

  if (currentView === 'admin_dashboard') {
    if (!admin) {
      return <AdminLoginPage onSuccess={() => setCurrentView('admin_dashboard')} />;
    }
    return <AdminDashboardPage onLogout={() => setCurrentView('admin_login')} />;
  }

  // Participant routing branch
  if (!participant) {
    return (
      <div>
        <LoginPage />
        {/* Discrete bottom link to Admin Login */}
        <div className="fixed bottom-3 right-3 z-50">
          <button
            onClick={() => setCurrentView('admin_login')}
            className="text-[11px] text-[#8B93A0] hover:text-[#16233F] underline font-mono"
          >
            Organizer Login →
          </button>
        </div>

        {/* Floating Dev Tools Switcher on Login */}
        <div className="fixed top-2 right-2 z-50 bg-[#16233F] text-white px-3 py-1.5 rounded-[4px] shadow-lg border border-white/20 flex items-center space-x-2 text-[11px] opacity-90 hover:opacity-100 transition-opacity">
          <span className="text-white/60 font-mono text-[10px] font-bold">DEV:</span>
          <button
            onClick={() => { window.location.hash = 'admin'; setCurrentView('admin_login'); }}
            className="px-2 py-0.5 rounded-[2px] bg-[#3FB950] text-black font-bold hover:bg-[#34a444]"
          >
            Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Participant view routing */}
      {currentView === 'dashboard' && (
        <DashboardPage
          onStartMCQ={() => setCurrentView('mcq')}
          onStartCoding={() => setCurrentView('coding')}
        />
      )}

      {currentView === 'mcq' && (
        <MCQPage
          onComplete={() => setCurrentView('waiting')}
          onTerminated={() => setCurrentView('termination')}
        />
      )}

      {currentView === 'waiting' && (
        <WaitingPage
          onLevel2Opened={() => setCurrentView('coding')}
          onReturnToDashboard={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'coding' && (
        <CodingPage
          onComplete={() => setCurrentView('dashboard')}
        />
      )}

      {currentView === 'termination' && (
        <TerminationPage
          reason="repeated tab-switch violations during the assessment"
          onReturnToDashboard={() => setCurrentView('dashboard')}
        />
      )}

      {/* Floating Dev Tools Switcher */}
      <div className="fixed top-2 right-2 z-50 bg-[#16233F] text-white px-3 py-1.5 rounded-[4px] shadow-lg border border-white/20 flex items-center space-x-2 text-[11px] opacity-90 hover:opacity-100 transition-opacity">
        <span className="text-white/60 font-mono text-[10px] font-bold">DEV:</span>
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`px-2 py-0.5 rounded-[2px] font-medium transition-colors ${currentView === 'dashboard' ? 'bg-white text-[#16233F] font-bold' : 'hover:bg-white/10 text-white/80'}`}
        >
          Dash
        </button>
        <button
          onClick={() => setCurrentView('mcq')}
          className={`px-2 py-0.5 rounded-[2px] font-medium transition-colors ${currentView === 'mcq' ? 'bg-white text-[#16233F] font-bold' : 'hover:bg-white/10 text-white/80'}`}
        >
          MCQ
        </button>
        <button
          onClick={() => setCurrentView('waiting')}
          className={`px-2 py-0.5 rounded-[2px] font-medium transition-colors ${currentView === 'waiting' ? 'bg-white text-[#16233F] font-bold' : 'hover:bg-white/10 text-white/80'}`}
        >
          Wait
        </button>
        <button
          onClick={() => setCurrentView('coding')}
          className={`px-2 py-0.5 rounded-[2px] font-medium transition-colors ${currentView === 'coding' ? 'bg-white text-[#16233F] font-bold' : 'hover:bg-white/10 text-white/80'}`}
        >
          Code
        </button>
        <button
          onClick={() => { window.location.hash = 'admin'; setCurrentView('admin_login'); }}
          className="px-2 py-0.5 rounded-[2px] bg-[#3FB950] text-black font-bold hover:bg-[#34a444]"
        >
          Admin
        </button>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <AppContent />
      </AdminAuthProvider>
    </AuthProvider>
  );
};

export default App;
