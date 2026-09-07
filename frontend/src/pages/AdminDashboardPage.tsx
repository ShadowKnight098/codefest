import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { apiFetch } from '../api/client';

type Tab = 'overview' | 'participants' | 'mcq' | 'coding' | 'settings' | 'export' | 'organizers' | 'winners1' | 'winners2';

export const AdminDashboardPage: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { admin, logout } = useAdminAuth();
  const isSuperAdmin = admin?.role === 'SUPERADMIN';
  const [activeTab, setActiveTab] = useState<Tab>(isSuperAdmin ? 'overview' : 'export');
  const [stats, setStats] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Participants tab state
  const [participants, setParticipants] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<number | ''>('');
  const [importFile, setImportFile] = useState<File | null>(null);

  // Single Participant Modal
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [newPart, setNewPart] = useState({
    roll_number: '',
    name: '',
    email: '',
    academic_year: 2,
  });

  // Bulk Text Import Modal
  const [showBulkTextModal, setShowBulkTextModal] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Organizers tab state
  const [organizers, setOrganizers] = useState<any[]>([]);
  const [showAddOrgModal, setShowAddOrgModal] = useState(false);
  const [newOrg, setNewOrg] = useState({
    username: '',
    email: '',
    password: '',
    role: 'ORGANIZER',
  });

  // MCQ Questions tab state
  const [questions, setQuestions] = useState<any[]>([]);
  const [qYearFilter, setQYearFilter] = useState<number | ''>('');
  const [qImportFile, setQImportFile] = useState<File | null>(null);
  const [showAddQModal, setShowAddQModal] = useState(false);
  const [newQ, setNewQ] = useState({
    academic_year: 2,
    topic: '',
    difficulty: 'MEDIUM',
    question_text: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'A'
  });

  // Coding Problems tab state
  const [problems, setProblems] = useState<any[]>([]);
  const [showAddProbModal, setShowAddProbModal] = useState(false);
  const [newProb, setNewProb] = useState({
    title: '',
    description: '',
    constraints: '',
    time_limit_ms: 2000,
    memory_limit_mb: 256,
    marks: 20,
    order_num: 1,
    test_cases: [
      { input_data: '', expected_output: '', is_hidden: false, order_num: 1 },
      { input_data: '', expected_output: '', is_hidden: true, order_num: 2 }
    ]
  });

  // Test Case management state
  const [showAddTestCaseModal, setShowAddTestCaseModal] = useState(false);
  const [selectedProblemForTestCase, setSelectedProblemForTestCase] = useState<any>(null);
  const [newTestCase, setNewTestCase] = useState({
    input_data: '',
    expected_output: '',
    is_hidden: false,
    order_num: 1,
  });

  // Settings tab state
  const [settingsList, setSettingsList] = useState<any[]>([]);

  // Leaderboard tab state
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  // Winners state
  const [winners1, setWinners1] = useState<any[]>([]);
  const [winners2, setWinners2] = useState<any[]>([]);

  // Auto-sync & Live Refresh state
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastSynced, setLastSynced] = useState<Date>(new Date());

  // Round 1 Filter state
  const [r1Filter, setR1Filter] = useState<'ALL' | 'QUALIFIED' | 'DISQUALIFIED'>('ALL');
  const [r1YearFilter, setR1YearFilter] = useState<number | ''>('');
  const [r1Search, setR1Search] = useState<string>('');

  // Round 2 Filter state
  const [r2YearFilter, setR2YearFilter] = useState<number | ''>('');
  const [r2Search, setR2Search] = useState<string>('');

  // Leaderboard Filter state
  const [lbFilter, setLbFilter] = useState<'ALL' | 'QUALIFIED' | 'DISQUALIFIED'>('ALL');
  const [lbYearFilter, setLbYearFilter] = useState<number | ''>('');
  const [lbSearch, setLbSearch] = useState<string>('');

  const fetchOverview = async () => {
    try {
      const statsData = await apiFetch<any>('/admin/monitor/live');
      setStats(statsData);
      const comps = await apiFetch<any[]>('/admin/competitions');
      if (comps.length > 0) {
        const roundsData = await apiFetch<any[]>(`/admin/competitions/${comps[0].id}/rounds`);
        setRounds(roundsData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchParticipants = async () => {
    try {
      let url = '/admin/participants?limit=500';
      if (yearFilter) url += `&year=${yearFilter}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      const data = await apiFetch<any[]>(url);
      setParticipants(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setParticipants([]);
    }
  };

  const fetchQuestions = async () => {
    try {
      let url = '/admin/mcq-questions?limit=200';
      if (qYearFilter) url += `&year=${qYearFilter}`;
      const data = await apiFetch<any[]>(url);
      setQuestions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setQuestions([]);
    }
  };

  const fetchProblems = async () => {
    try {
      const data = await apiFetch<any[]>('/admin/coding-problems');
      setProblems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setProblems([]);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiFetch<any[]>('/admin/settings');
      setSettingsList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setSettingsList([]);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const data = await apiFetch<any[]>('/admin/monitor/leaderboard');
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setLeaderboard([]);
    }
  };

  const fetchWinners1 = async () => {
    try {
      const data = await apiFetch<any[]>('/admin/monitor/leaderboard');
      // Round 1 winners = those who have an mcq_score (participated in MCQ)
      const r1 = (Array.isArray(data) ? data : [])
        .filter((e: any) => e.mcq_score !== null)
        .sort((a: any, b: any) => b.mcq_score - a.mcq_score || a.violations - b.violations)
        .map((e: any, i: number) => ({ ...e, r1_rank: i + 1 }));
      setWinners1(r1);
    } catch (e) {
      console.error(e);
      setWinners1([]);
    }
  };

  const fetchWinners2 = async () => {
    try {
      const data = await apiFetch<any[]>('/admin/monitor/leaderboard');
      // Round 2 winners = those who have a coding_score
      const r2 = (Array.isArray(data) ? data : [])
        .filter((e: any) => e.coding_score !== null)
        .sort((a: any, b: any) => b.total_score - a.total_score || a.violations - b.violations)
        .map((e: any, i: number) => ({ ...e, r2_rank: i + 1 }));
      setWinners2(r2);
    } catch (e) {
      console.error(e);
      setWinners2([]);
    }
  };

  const refreshActiveTab = async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'overview' && isSuperAdmin) await fetchOverview();
      else if (activeTab === 'participants' && isSuperAdmin) await fetchParticipants();
      else if (activeTab === 'mcq' && isSuperAdmin) await fetchQuestions();
      else if (activeTab === 'coding' && isSuperAdmin) await fetchProblems();
      else if (activeTab === 'organizers' && isSuperAdmin) await fetchOrganizers();
      else if (activeTab === 'settings' && isSuperAdmin) await fetchSettings();
      else if (activeTab === 'export') await fetchLeaderboard();
      else if (activeTab === 'winners1') await fetchWinners1();
      else if (activeTab === 'winners2') await fetchWinners2();
      setLastSynced(new Date());
    } catch (e) {
      console.error('Refresh failed', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Helper: download data as CSV in the browser (no server auth needed)
  const downloadCSV = (rows: any[], filename: string, headers: string[], keys: string[]) => {
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(keys.map(k => JSON.stringify(row[k] ?? '')).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchOrganizers = async () => {
    try {
      const data = await apiFetch<any[]>('/admin/organizers');
      setOrganizers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setOrganizers([]);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin && activeTab !== 'export' && activeTab !== 'winners1' && activeTab !== 'winners2') {
      setActiveTab('export');
      return;
    }
    refreshActiveTab();
  }, [activeTab, yearFilter, search, qYearFilter, isSuperAdmin]);

  // Periodic Live Auto-Sync (10 seconds to optimize server load)
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      refreshActiveTab();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoSync, activeTab, yearFilter, search, qYearFilter, isSuperAdmin]);

  const filteredWinners1 = winners1.filter((w) => {
    if (r1Filter === 'QUALIFIED' && !w.mcq_qualified) return false;
    if (r1Filter === 'DISQUALIFIED' && w.mcq_qualified) return false;
    if (r1YearFilter && w.academic_year !== r1YearFilter) return false;
    if (r1Search) {
      const s = r1Search.toLowerCase();
      return (
        w.roll_number?.toLowerCase().includes(s) ||
        w.name?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const filteredWinners2 = winners2.filter((w) => {
    if (r2YearFilter && w.academic_year !== r2YearFilter) return false;
    if (r2Search) {
      const s = r2Search.toLowerCase();
      return (
        w.roll_number?.toLowerCase().includes(s) ||
        w.name?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const filteredLeaderboard = leaderboard.filter((w) => {
    if (lbFilter === 'QUALIFIED' && !w.mcq_qualified) return false;
    if (lbFilter === 'DISQUALIFIED' && w.mcq_qualified) return false;
    if (lbYearFilter && w.academic_year !== lbYearFilter) return false;
    if (lbSearch) {
      const s = lbSearch.toLowerCase();
      return (
        w.roll_number?.toLowerCase().includes(s) ||
        w.name?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const toggleRound = async (roundId: string, currentStatus: boolean) => {
    setLoading(true);
    try {
      await apiFetch(`/admin/rounds/${roundId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_open: !currentStatus }),
      });
      setMessage(`Round status updated successfully.`);
      await fetchOverview();
    } catch (e: any) {
      setMessage(`Error: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    const formData = new FormData();
    formData.append('file', importFile);
    setLoading(true);
    try {
      const res = await apiFetch<any>('/admin/participants/import', {
        method: 'POST',
        body: formData,
      });
      let msg = `Imported ${res.imported} participants successfully (${res.skipped} skipped).`;
      if (res.skipped > 0 && res.errors && res.errors.length > 0) {
        msg += ` Issues: ${res.errors.map((err: any) => `Row ${err.row_number} (${err.roll_number || 'N/A'}): ${err.error}`).join(' | ')}`;
      }
      setMessage(msg);
      fetchParticipants();
    } catch (e: any) {
      setMessage(`Import failed: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportMCQCSV = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qImportFile) return;
    const formData = new FormData();
    formData.append('file', qImportFile);
    setLoading(true);
    try {
      const res = await apiFetch<any>('/admin/mcq-questions/import', {
        method: 'POST',
        body: formData,
      });
      setMessage(res.message || 'Questions imported successfully.');
      fetchQuestions();
    } catch (e: any) {
      setMessage(`Import failed: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/admin/mcq-questions', {
        method: 'POST',
        body: JSON.stringify(newQ),
      });
      setMessage('Question added successfully.');
      setShowAddQModal(false);
      fetchQuestions();
    } catch (e: any) {
      setMessage(`Failed: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await apiFetch(`/admin/mcq-questions/${id}`, { method: 'DELETE' });
      fetchQuestions();
    } catch (e: any) {
      alert(`Delete failed: ${e?.detail || e.message}`);
    }
  };

  const handleAddProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/admin/coding-problems', {
        method: 'POST',
        body: JSON.stringify(newProb),
      });
      setMessage('Coding problem added successfully.');
      setShowAddProbModal(false);
      fetchProblems();
    } catch (e: any) {
      setMessage(`Failed: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProblem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this problem?')) return;
    try {
      await apiFetch(`/admin/coding-problems/${id}`, { method: 'DELETE' });
      fetchProblems();
    } catch (e: any) {
      alert(`Delete failed: ${e?.detail || e.message}`);
    }
  };

  const handleAddTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProblemForTestCase) return;
    setLoading(true);
    try {
      await apiFetch(`/admin/coding-problems/${selectedProblemForTestCase.id}/test-cases`, {
        method: 'POST',
        body: JSON.stringify(newTestCase),
      });
      setMessage(`Test case added to "${selectedProblemForTestCase.title}".`);
      setShowAddTestCaseModal(false);
      setNewTestCase({ input_data: '', expected_output: '', is_hidden: false, order_num: 1 });
      fetchProblems();
    } catch (e: any) {
      setMessage(`Failed to add test case: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTestCase = async (testCaseId: string, probTitle: string) => {
    if (!confirm(`Delete test case from "${probTitle}"?`)) return;
    try {
      await apiFetch(`/admin/coding-problems/test-cases/${testCaseId}`, { method: 'DELETE' });
      fetchProblems();
    } catch (e: any) {
      alert(`Delete failed: ${e?.detail || e.message}`);
    }
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      await apiFetch(`/admin/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      setMessage(`Setting ${key} updated.`);
      fetchSettings();
    } catch (e: any) {
      alert(`Failed to update setting: ${e?.detail || e.message}`);
    }
  };

  const handleResetPin = async (id: string, roll: string) => {
    try {
      const res = await apiFetch<any>(`/admin/participants/${id}/reset-pin`, { method: 'POST' });
      alert(`PIN for ${roll} reset to: ${res.new_pin}`);
    } catch (e: any) {
      alert(`Failed to reset PIN: ${e?.detail || e.message}`);
    }
  };

  const handleAddSingleParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/participants', {
        method: 'POST',
        body: JSON.stringify(newPart),
      });
      setMessage(`Participant ${newPart.roll_number} added with roll number as password.`);
      setShowAddPartModal(false);
      setNewPart({ roll_number: '', name: '', email: '', academic_year: 2 });
      fetchParticipants();
    } catch (e: any) {
      alert(`Failed to add participant: ${e?.detail || e.message}`);
    }
  };

  const handleImportBulkText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    try {
      const res = await apiFetch<any>('/admin/participants/import-text', {
        method: 'POST',
        body: JSON.stringify({ raw_text: bulkText }),
      });
      let msg = `Imported ${res.imported} participants (${res.skipped} skipped).`;
      if (res.skipped > 0 && res.errors && res.errors.length > 0) {
        msg += ` Issues: ${res.errors.map((err: any) => `Row ${err.row_number} (${err.roll_number || 'N/A'}): ${err.error}`).join(' | ')}`;
      }
      setMessage(msg);
      setShowBulkTextModal(false);
      setBulkText('');
      fetchParticipants();
    } catch (e: any) {
      alert(`Failed to import text: ${e?.detail || e.message}`);
    }
  };

  const handleDeleteParticipant = async (id: string, roll: string) => {
    if (!confirm(`Are you sure you want to delete participant ${roll}?`)) return;
    try {
      await apiFetch(`/admin/participants/${id}`, { method: 'DELETE' });
      setMessage(`Participant ${roll} deleted.`);
      fetchParticipants();
    } catch (e: any) {
      alert(`Failed to delete participant: ${e?.detail || e.message}`);
    }
  };

  const handleToggleParticipant = async (id: string, currentStatus: boolean) => {
    try {
      await apiFetch(`/admin/participants/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_enabled: !currentStatus }),
      });
      fetchParticipants();
    } catch (e: any) {
      alert(`Failed to update status: ${e?.detail || e.message}`);
    }
  };

  const handleAddOrganizer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/organizers', {
        method: 'POST',
        body: JSON.stringify(newOrg),
      });
      setMessage(`Organizer ${newOrg.username} created successfully.`);
      setShowAddOrgModal(false);
      setNewOrg({ username: '', email: '', password: '', role: 'ORGANIZER' });
      fetchOrganizers();
    } catch (e: any) {
      alert(`Failed to create organizer: ${e?.detail || e.message}`);
    }
  };

  const handleDeleteOrganizer = async (id: string, username: string) => {
    if (!confirm(`Are you sure you want to revoke access for ${username}?`)) return;
    try {
      await apiFetch(`/admin/organizers/${id}`, { method: 'DELETE' });
      setMessage(`Organizer ${username} access revoked.`);
      fetchOrganizers();
    } catch (e: any) {
      alert(`Failed to delete organizer: ${e?.detail || e.message}`);
    }
  };

  const tabs = isSuperAdmin
    ? [
        { id: 'overview' as Tab, label: '🟢 Live Operations' },
        { id: 'export' as Tab, label: '📊 Live Leaderboard' },
        { id: 'winners1' as Tab, label: '🥇 Round 1 Results' },
        { id: 'winners2' as Tab, label: '🏆 Round 2 Results' },
        { id: 'participants' as Tab, label: 'Participants' },
        { id: 'mcq' as Tab, label: 'MCQ Bank Manager' },
        { id: 'coding' as Tab, label: 'Coding Problems' },
        { id: 'organizers' as Tab, label: 'Organizer Team' },
        { id: 'settings' as Tab, label: 'Competition Settings' },
      ]
    : [
        { id: 'export' as Tab, label: '📊 Live Leaderboard' },
        { id: 'winners1' as Tab, label: '🥇 Round 1 Results' },
        { id: 'winners2' as Tab, label: '🏆 Round 2 Results' },
      ];

  return (
    <div className="min-h-screen bg-[#F6F6F2] font-sans text-[#1B2029] flex flex-col">
      {/* Top Navigation */}
      <header className="bg-[#16233F] text-white px-6 py-3.5 border-b border-[#25355B] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#3FB950]" />
          <div>
            <span className="font-bold tracking-tight text-sm">CodeFest 2026</span>
            <span className="text-white/80 text-xs ml-2">
              {isSuperAdmin ? 'Faculty Command Center' : 'Organizer Portal'}
            </span>
            <span className={`text-[10px] ml-2 font-mono px-1.5 py-0.5 rounded ${
              isSuperAdmin ? 'bg-[#3FB950]/20 text-[#3FB950] border border-[#3FB950]/40' : 'bg-[#E3B341]/20 text-[#E3B341] border border-[#E3B341]/40'
            }`}>
              {isSuperAdmin ? 'SUPERADMIN (Full Access)' : 'ORGANIZER (Leaderboard & Results)'}
            </span>
          </div>
        </div>

        {/* Live Sync and Refresh Controls */}
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-[11px] font-mono text-white/60 hidden md:inline">
            Synced: {lastSynced.toLocaleTimeString()}
          </span>

          <button
            onClick={() => setAutoSync(!autoSync)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs transition-colors border font-medium ${
              autoSync
                ? 'bg-[#3FB950]/20 text-[#3FB950] border-[#3FB950]/50'
                : 'bg-white/10 text-white/60 border-white/20 hover:text-white'
            }`}
            title="Toggle 10-second automatic data synchronization"
          >
            <span className={`w-2 h-2 rounded-full ${autoSync ? 'bg-[#3FB950] animate-pulse' : 'bg-white/40'}`} />
            <span>{autoSync ? 'Live Sync (10s)' : 'Sync Off'}</span>
          </button>

          <button
            onClick={refreshActiveTab}
            disabled={isRefreshing}
            className="flex items-center space-x-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors font-medium border border-white/20 disabled:opacity-50"
            title="Manually fetch latest data from server"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>🔄</span>
            <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          <span className="text-white/40">|</span>

          <span className="text-white/70">Logged in as <strong>{admin?.username}</strong></span>
          <button
            onClick={() => { logout(); onLogout(); }}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-[2px] transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Layout: Sidebar + Content */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-[#DBD7C9] p-3 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-3 py-2 text-xs font-medium rounded-[3px] transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#16233F] text-white font-bold'
                  : 'text-[#59626F] hover:bg-[#F6F6F2] hover:text-[#1B2029]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 overflow-y-auto max-w-6xl">
          {message && (
            <div className="mb-4 p-3 bg-[#EEF1F6] border border-[#C6C1B0] text-xs text-[#16233F] rounded-[3px] flex items-center justify-between">
              <span>{message}</span>
              <button onClick={() => setMessage(null)} className="font-bold">×</button>
            </div>
          )}

          {/* TAB 1: OVERVIEW & ROUND TOGGLE */}
          {activeTab === 'overview' && isSuperAdmin && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[#16233F]">Live Competition State</h2>
                <p className="text-xs text-[#59626F]">Real-time stats across 400-500 participants and round gating controls</p>
              </div>

              {/* Round Toggle Cards */}
              <div className="grid grid-cols-2 gap-4">
                {rounds.map((r) => (
                  <div key={r.id} className="bg-white border border-[#DBD7C9] rounded-[4px] p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-[#59626F]">
                        Round {r.round_number}
                      </span>
                      <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold uppercase font-mono ${
                        r.is_open ? 'bg-[#E8F3EC] text-[#1E7E34]' : 'bg-[#FCEDEC] text-[#A82A2A]'
                      }`}>
                        {r.is_open ? '● OPEN' : '○ CLOSED'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#16233F] mb-1">{r.name}</h3>
                    <p className="text-xs text-[#59626F] mb-4">Duration: {r.duration_minutes} minutes</p>
                    <button
                      disabled={loading}
                      onClick={() => toggleRound(r.id, r.is_open)}
                      className={`w-full py-2 text-xs font-bold rounded-[3px] transition-colors ${
                        r.is_open
                          ? 'bg-[#A82A2A] text-white hover:bg-[#8B2020]'
                          : 'bg-[#1E7E34] text-white hover:bg-[#166027]'
                      }`}
                    >
                      {r.is_open ? 'Close Round' : 'Open Round for Participants'}
                    </button>
                  </div>
                ))}
              </div>

              {/* Live Metric Cards */}
              {stats && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-white border border-[#DBD7C9] p-4 rounded-[4px]">
                    <div className="text-[11px] text-[#59626F] font-medium">Total Registered</div>
                    <div className="text-2xl font-bold font-mono text-[#16233F] mt-1">{stats.total_participants}</div>
                    <div className="text-[10px] text-[#8B93A0] mt-0.5">{stats.enabled_participants} enabled</div>
                  </div>
                  <div className="bg-white border border-[#DBD7C9] p-4 rounded-[4px]">
                    <div className="text-[11px] text-[#59626F] font-medium">MCQ In-Progress</div>
                    <div className="text-2xl font-bold font-mono text-[#16233F] mt-1">{stats.active_mcq_attempts}</div>
                    <div className="text-[10px] text-[#8B93A0] mt-0.5">{stats.submitted_mcq_attempts} submitted</div>
                  </div>
                  <div className="bg-white border border-[#DBD7C9] p-4 rounded-[4px]">
                    <div className="text-[11px] text-[#59626F] font-medium">Qualified for Level 2</div>
                    <div className="text-2xl font-bold font-mono text-[#1E7E34] mt-1">{stats.qualified_count}</div>
                    <div className="text-[10px] text-[#8B93A0] mt-0.5">{stats.not_qualified_count} not qualified</div>
                  </div>
                  <div className="bg-white border border-[#DBD7C9] p-4 rounded-[4px]">
                    <div className="text-[11px] text-[#59626F] font-medium">Tab Violations</div>
                    <div className="text-2xl font-bold font-mono text-[#A82A2A] mt-1">{stats.total_violations}</div>
                    <div className="text-[10px] text-[#8B93A0] mt-0.5">{stats.terminated_count} terminated</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PARTICIPANTS & BULK/SINGLE IMPORT */}
          {activeTab === 'participants' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">Participant Management</h2>
                  <p className="text-xs text-[#59626F]">Add individual students, paste bulk lists from Excel, or upload CSV</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowAddPartModal(true)}
                    className="px-3 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] hover:bg-[#25355B]"
                  >
                    + Add Single Participant
                  </button>
                  <button
                    onClick={() => setShowBulkTextModal(true)}
                    className="px-3 py-1.5 bg-white border border-[#16233F] text-[#16233F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2]"
                  >
                    📋 Paste / Bulk Import
                  </button>
                </div>
              </div>

              {/* Filter / Search Strip */}
              <div className="flex items-center space-x-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Roll No, Name or Email…"
                  className="h-8 px-3 text-xs border border-[#C6C1B0] rounded-[3px] w-64"
                />
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value ? Number(e.target.value) : '')}
                  className="h-8 px-2 text-xs border border-[#C6C1B0] rounded-[3px] bg-white"
                >
                  <option value="">All Years</option>
                  <option value="1">Year 1</option>
                  <option value="2">Year 2</option>
                  <option value="3">Year 3</option>
                  <option value="4">Year 4</option>
                </select>
                <span className="text-xs text-[#8B93A0]">{participants.length} records</span>
              </div>

              {/* Table */}
              <div className="bg-white border border-[#DBD7C9] rounded-[4px] overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F6F6F2] border-b border-[#DBD7C9] font-semibold text-[#16233F]">
                      <th className="py-2.5 px-3 font-mono">Roll Number</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Email</th>
                      <th className="py-2.5 px-3 text-center">Year</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DBD7C9]">
                    {participants.map((p) => (
                      <tr key={p.id} className="hover:bg-[#F6F6F2]/50">
                        <td className="py-2.5 px-3 font-mono font-medium text-[#16233F]">{p.roll_number}</td>
                        <td className="py-2.5 px-3">{p.name}</td>
                        <td className="py-2.5 px-3 text-[#59626F]">{p.email}</td>
                        <td className="py-2.5 px-3 text-center">{p.academic_year}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleParticipant(p.id, p.is_enabled)}
                            className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold cursor-pointer transition-opacity hover:opacity-80 ${
                              p.is_enabled ? 'bg-[#E8F3EC] text-[#1E7E34]' : 'bg-[#FCEDEC] text-[#A82A2A]'
                            }`}
                            title="Click to toggle account status"
                          >
                            {p.is_enabled ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-3">
                          <button
                            onClick={() => handleResetPin(p.id, p.roll_number)}
                            className="text-[#16233F] hover:underline font-mono text-[11px]"
                            title="Reset password to roll number"
                          >
                            Reset Password
                          </button>
                          <button
                            onClick={() => handleDeleteParticipant(p.id, p.roll_number)}
                            className="text-[#A82A2A] hover:underline font-mono text-[11px]"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Single Participant Modal */}
              {showAddPartModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[6px] max-w-md w-full p-6 shadow-xl border border-[#DBD7C9]">
                    <h3 className="font-serif text-lg font-bold text-[#16233F] mb-1">Add Single Participant</h3>
                    <p className="text-xs text-[#59626F] mb-4">
                      The password will automatically be set to the student's <strong>Roll Number</strong>.
                    </p>
                    <form onSubmit={handleAddSingleParticipant} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Roll Number</label>
                        <input
                          type="text"
                          required
                          value={newPart.roll_number}
                          onChange={(e) => setNewPart({ ...newPart, roll_number: e.target.value.toUpperCase() })}
                          placeholder="e.g. 24AIML042"
                          className="w-full border border-[#C6C1B0] p-2 rounded font-mono uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Full Name</label>
                        <input
                          type="text"
                          required
                          value={newPart.name}
                          onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                          placeholder="e.g. Kiran Kumar"
                          className="w-full border border-[#C6C1B0] p-2 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Institutional Email</label>
                        <input
                          type="email"
                          required
                          value={newPart.email}
                          onChange={(e) => setNewPart({ ...newPart, email: e.target.value })}
                          placeholder="e.g. kiran@rgmcet.edu.in"
                          className="w-full border border-[#C6C1B0] p-2 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Academic Year</label>
                        <select
                          value={newPart.academic_year}
                          onChange={(e) => setNewPart({ ...newPart, academic_year: Number(e.target.value) })}
                          className="w-full border border-[#C6C1B0] p-2 rounded bg-white"
                        >
                          <option value={1}>Year 1</option>
                          <option value={2}>Year 2</option>
                          <option value={3}>Year 3</option>
                          <option value={4}>Year 4</option>
                        </select>
                      </div>

                      <div className="p-2.5 bg-[#F6F6F2] rounded border border-[#DBD7C9] text-[11px] text-[#59626F]">
                        🔑 <strong>Login Credentials:</strong> Student will log in using their Roll Number, Email, and Roll Number as password.
                      </div>

                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddPartModal(false)}
                          className="px-3 py-1.5 border border-[#C6C1B0] rounded text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B]"
                        >
                          Add Participant
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Bulk Import / Paste Modal */}
              {showBulkTextModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[6px] max-w-xl w-full p-6 shadow-xl border border-[#DBD7C9]">
                    <h3 className="font-serif text-lg font-bold text-[#16233F] mb-1">Bulk Participant Import</h3>
                    <p className="text-xs text-[#59626F] mb-3">
                      Paste rows directly from Excel or Google Sheets. Each student's password defaults to their Roll Number.
                    </p>

                    {/* Method 1: Paste Text */}
                    <form onSubmit={handleImportBulkText} className="space-y-3 text-xs mb-4">
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">
                          Paste Data (Format: <code>RollNumber, Name, Email, Year</code>)
                        </label>
                        <textarea
                          rows={6}
                          required
                          value={bulkText}
                          onChange={(e) => setBulkText(e.target.value)}
                          placeholder={"24AIML001, Aarav Sharma, aarav@aiml.edu, 2\n24AIML002, Sneha Reddy, sneha@aiml.edu, 2\n24AIML003, Rohan Verma, rohan@aiml.edu, 3"}
                          className="w-full border border-[#C6C1B0] p-2.5 rounded font-mono text-xs"
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-[#8B93A0]">Tab or comma separated rows supported</span>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B]"
                        >
                          Import All Pasted
                        </button>
                      </div>
                    </form>

                    <div className="border-t border-[#DBD7C9] pt-3">
                      <div className="text-xs font-semibold text-[#59626F] mb-2">Or Upload a CSV File:</div>
                      <form onSubmit={handleImportCSV} className="flex items-center space-x-2">
                        <input
                          type="file"
                          accept=".csv"
                          onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                          className="text-xs text-[#59626F] file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-[#EEF1F6] file:text-[#16233F]"
                        />
                        <button
                          type="submit"
                          disabled={!importFile || loading}
                          className="px-3 py-1 bg-[#16233F] text-white text-xs font-semibold rounded disabled:opacity-50"
                        >
                          Upload CSV
                        </button>
                      </form>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-[#DBD7C9] mt-4">
                      <button
                        type="button"
                        onClick={() => setShowBulkTextModal(false)}
                        className="px-3 py-1.5 border border-[#C6C1B0] rounded text-xs"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MCQ QUESTION BANK */}
          {activeTab === 'mcq' && isSuperAdmin && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">MCQ Question Bank Manager</h2>
                  <p className="text-xs text-[#59626F]">Manage, edit, add, or bulk import questions per academic year</p>
                </div>
                <button
                  onClick={() => setShowAddQModal(true)}
                  className="px-3 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px]"
                >
                  + Add Question
                </button>
              </div>

              {/* Bulk Import */}
              <div className="bg-white border border-[#DBD7C9] p-4 rounded-[4px]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#16233F] mb-1">
                  Bulk CSV Question Import
                </h3>
                <p className="text-xs text-[#59626F] mb-3">
                  Format: <code className="bg-[#EEF1F6] px-1 py-0.5 rounded text-[11px]">academic_year, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_option</code>
                </p>
                <form onSubmit={handleImportMCQCSV} className="flex items-center space-x-3">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setQImportFile(e.target.files?.[0] || null)}
                    className="text-xs text-[#59626F] file:mr-3 file:py-1.5 file:px-3 file:rounded-[2px] file:border-0 file:text-xs file:font-semibold file:bg-[#16233F] file:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!qImportFile || loading}
                    className="px-3 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] disabled:opacity-50"
                  >
                    Import CSV
                  </button>
                </form>
              </div>

              {/* Year Filter */}
              <div className="flex items-center space-x-3">
                <select
                  value={qYearFilter}
                  onChange={(e) => setQYearFilter(e.target.value ? Number(e.target.value) : '')}
                  className="h-8 px-2 text-xs border border-[#C6C1B0] rounded-[3px] bg-white"
                >
                  <option value="">All Academic Years</option>
                  <option value="1">Year 1</option>
                  <option value="2">Year 2</option>
                  <option value="3">Year 3</option>
                  <option value="4">Year 4</option>
                </select>
                <span className="text-xs text-[#8B93A0]">{questions.length} questions loaded</span>
              </div>

              {/* Questions List */}
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={q.id} className="bg-white border border-[#DBD7C9] rounded-[4px] p-4 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-[#16233F]">#{idx + 1}</span>
                        <span className="px-1.5 py-0.5 bg-[#EEF1F6] text-[#16233F] font-mono text-[10px] rounded">
                          Year {q.academic_year}
                        </span>
                        <span className="font-semibold text-[#59626F]">{q.topic}</span>
                        <span className="text-[10px] text-[#8B93A0]">[{q.difficulty}]</span>
                      </div>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="text-[#A82A2A] hover:underline text-[11px]"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="font-medium text-[#1B2029] mb-2">{q.question_text}</div>
                    <div className="grid grid-cols-2 gap-2 text-[#59626F]">
                      <div className={q.correct_option === 'A' ? 'font-bold text-[#1E7E34]' : ''}>A. {q.option_a}</div>
                      <div className={q.correct_option === 'B' ? 'font-bold text-[#1E7E34]' : ''}>B. {q.option_b}</div>
                      <div className={q.correct_option === 'C' ? 'font-bold text-[#1E7E34]' : ''}>C. {q.option_c}</div>
                      <div className={q.correct_option === 'D' ? 'font-bold text-[#1E7E34]' : ''}>D. {q.option_d}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Question Modal */}
              {showAddQModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                  <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-6 max-w-lg w-full text-xs space-y-3">
                    <h3 className="text-sm font-bold text-[#16233F]">Add New MCQ Question</h3>
                    <form onSubmit={handleAddQuestion} className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Year</label>
                          <select
                            value={newQ.academic_year}
                            onChange={(e) => setNewQ({ ...newQ, academic_year: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1 rounded"
                          >
                            <option value="1">Year 1</option>
                            <option value="2">Year 2</option>
                            <option value="3">Year 3</option>
                            <option value="4">Year 4</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Topic</label>
                          <input
                            type="text"
                            value={newQ.topic}
                            onChange={(e) => setNewQ({ ...newQ, topic: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Difficulty</label>
                          <select
                            value={newQ.difficulty}
                            onChange={(e) => setNewQ({ ...newQ, difficulty: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded"
                          >
                            <option value="EASY">EASY</option>
                            <option value="MEDIUM">MEDIUM</option>
                            <option value="HARD">HARD</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold">Question Text</label>
                        <textarea
                          value={newQ.question_text}
                          onChange={(e) => setNewQ({ ...newQ, question_text: e.target.value })}
                          className="w-full border border-[#C6C1B0] p-1 rounded h-16"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Option A"
                          value={newQ.option_a}
                          onChange={(e) => setNewQ({ ...newQ, option_a: e.target.value })}
                          className="border border-[#C6C1B0] p-1 rounded"
                          required
                        />
                        <input
                          placeholder="Option B"
                          value={newQ.option_b}
                          onChange={(e) => setNewQ({ ...newQ, option_b: e.target.value })}
                          className="border border-[#C6C1B0] p-1 rounded"
                          required
                        />
                        <input
                          placeholder="Option C"
                          value={newQ.option_c}
                          onChange={(e) => setNewQ({ ...newQ, option_c: e.target.value })}
                          className="border border-[#C6C1B0] p-1 rounded"
                          required
                        />
                        <input
                          placeholder="Option D"
                          value={newQ.option_d}
                          onChange={(e) => setNewQ({ ...newQ, option_d: e.target.value })}
                          className="border border-[#C6C1B0] p-1 rounded"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold">Correct Option</label>
                        <select
                          value={newQ.correct_option}
                          onChange={(e) => setNewQ({ ...newQ, correct_option: e.target.value })}
                          className="w-full border border-[#C6C1B0] p-1 rounded"
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                        </select>
                      </div>

                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddQModal(false)}
                          className="px-3 py-1 border border-[#C6C1B0] rounded"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-[#16233F] text-white rounded font-semibold"
                        >
                          Save Question
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CODING PROBLEMS */}
          {activeTab === 'coding' && isSuperAdmin && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">Coding Problem &amp; Test Case Manager</h2>
                  <p className="text-xs text-[#59626F]">Add, edit, or configure coding challenges, public sample test cases, and authoritative hidden evaluation test cases.</p>
                </div>
                <button
                  onClick={() => setShowAddProbModal(true)}
                  className="px-3.5 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] hover:bg-[#25355B]"
                >
                  + Add New Problem
                </button>
              </div>

              <div className="space-y-5">
                {problems.map((p) => (
                  <div key={p.id} className="bg-white border border-[#DBD7C9] rounded-[6px] p-5 text-xs space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#DBD7C9] pb-3">
                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono font-bold text-sm text-[#16233F] bg-[#EEF1F6] px-2 py-0.5 rounded-[3px]">
                          P{p.order_num}
                        </span>
                        <span className="font-serif font-bold text-base text-[#16233F]">{p.title}</span>
                        <span className={`px-2 py-0.5 font-mono rounded text-[10px] font-bold uppercase ${
                          p.order_num === 1 ? 'bg-[#E8F3EC] text-[#1E7A46]' : 'bg-[#FDEDEC] text-[#C0392B]'
                        }`}>
                          {p.marks} Marks · {p.order_num === 1 ? 'EASY' : 'HARD'}
                        </span>
                        <span className="text-[11px] font-mono text-[#8B93A0]">
                          Time Limit: {p.time_limit_ms}ms · RAM: {p.memory_limit_mb}MB
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setSelectedProblemForTestCase(p);
                            setNewTestCase({
                              input_data: '',
                              expected_output: '',
                              is_hidden: false,
                              order_num: (p.test_cases?.length || 0) + 1,
                            });
                            setShowAddTestCaseModal(true);
                          }}
                          className="px-3 py-1 bg-[#1E7E34] text-white font-semibold text-xs rounded-[3px] hover:bg-[#166027] transition-colors flex items-center space-x-1"
                        >
                          <span>+ Add Test Case</span>
                        </button>
                        <button
                          onClick={() => handleDeleteProblem(p.id)}
                          className="px-2.5 py-1 text-[#A82A2A] hover:bg-[#FDEDEC] rounded-[3px] transition-colors font-medium text-xs"
                        >
                          Delete Problem
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="font-mono text-[10px] uppercase font-bold text-[#59626F] mb-1">Description:</div>
                      <p className="text-[#1B2029] whitespace-pre-line bg-[#F6F6F2] p-3 rounded-[3px] border border-[#DBD7C9]/60 leading-relaxed">
                        {p.description}
                      </p>
                    </div>

                    {p.constraints && (
                      <div>
                        <div className="font-mono text-[10px] uppercase font-bold text-[#59626F] mb-1">Constraints:</div>
                        <pre className="text-[#59626F] font-mono text-[11px] bg-[#F6F6F2] p-2.5 rounded-[3px] border border-[#DBD7C9]/60 whitespace-pre-wrap">
                          {p.constraints}
                        </pre>
                      </div>
                    )}

                    {/* Test Cases Section */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-[#16233F] font-mono uppercase text-[11px] flex items-center space-x-1.5">
                          <span>Test Cases ({p.test_cases?.length || 0})</span>
                          <span className="text-[#8B93A0] font-normal normal-case text-[11px]">
                            ({p.test_cases?.filter((tc: any) => !tc.is_hidden).length || 0} Public Sample, {p.test_cases?.filter((tc: any) => tc.is_hidden).length || 0} Hidden)
                          </span>
                        </h4>
                      </div>

                      {p.test_cases && p.test_cases.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {p.test_cases.map((tc: any, i: number) => (
                            <div
                              key={tc.id}
                              className={`p-3 rounded-[4px] border transition-all ${
                                tc.is_hidden
                                  ? 'bg-[#FCF9F9] border-[#E8D2D2]'
                                  : 'bg-[#F9FCFA] border-[#D0E5D7]'
                              }`}
                            >
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono text-[11px] font-bold text-[#16233F]">
                                    Case #{i + 1}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded font-mono text-[9.5px] font-bold uppercase ${
                                      tc.is_hidden
                                        ? 'bg-[#FDEDEC] text-[#C0392B] border border-[#F5B7B1]'
                                        : 'bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF]'
                                    }`}
                                  >
                                    {tc.is_hidden ? '🔒 Hidden Case' : '👁 Public Sample'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTestCase(tc.id, p.title)}
                                  className="text-[#A82A2A] hover:bg-[#FDEDEC] px-1.5 py-0.5 rounded text-[11px] font-semibold"
                                  title="Delete Test Case"
                                >
                                  ✕ Delete
                                </button>
                              </div>

                              <div className="space-y-1.5 font-mono text-[11px]">
                                <div>
                                  <span className="text-[10px] text-[#59626F] block uppercase font-bold">Standard Input (stdin):</span>
                                  <pre className="bg-white p-1.5 border border-[#DBD7C9] rounded text-[#16233F] overflow-x-auto max-h-20">
                                    {tc.input_data || '(empty input)'}
                                  </pre>
                                </div>
                                <div>
                                  <span className="text-[10px] text-[#59626F] block uppercase font-bold">Expected Output (stdout):</span>
                                  <pre className="bg-white p-1.5 border border-[#DBD7C9] rounded text-[#1E7A46] font-bold overflow-x-auto max-h-20">
                                    {tc.expected_output}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 bg-[#F6F6F2] border border-[#DBD7C9] rounded text-center text-[#59626F] italic">
                          No test cases added yet. Click "+ Add Test Case" to create public samples and hidden test cases.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Problem Modal */}
              {showAddProbModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-6 max-w-lg w-full text-xs space-y-4 shadow-xl">
                    <div className="border-b border-[#DBD7C9] pb-2">
                      <h3 className="text-sm font-bold text-[#16233F]">Create New Coding Problem</h3>
                      <p className="text-[11px] text-[#59626F]">Add a new Level 2 programming challenge</p>
                    </div>

                    <form onSubmit={handleAddProblem} className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Problem Title</label>
                          <input
                            value={newProb.title}
                            onChange={(e) => setNewProb({ ...newProb, title: e.target.value })}
                            placeholder="e.g. Valid Palindrome"
                            className="w-full border border-[#C6C1B0] p-1.5 rounded"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Marks</label>
                            <input
                              type="number"
                              value={newProb.marks}
                              onChange={(e) => setNewProb({ ...newProb, marks: Number(e.target.value) })}
                              className="w-full border border-[#C6C1B0] p-1.5 rounded"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Order #</label>
                            <input
                              type="number"
                              value={newProb.order_num}
                              onChange={(e) => setNewProb({ ...newProb, order_num: Number(e.target.value) })}
                              className="w-full border border-[#C6C1B0] p-1.5 rounded"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Problem Description</label>
                        <textarea
                          value={newProb.description}
                          onChange={(e) => setNewProb({ ...newProb, description: e.target.value })}
                          placeholder="Describe the task and expected logic..."
                          className="w-full border border-[#C6C1B0] p-2 rounded h-24 font-sans text-xs"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Constraints &amp; Limits</label>
                        <textarea
                          value={newProb.constraints}
                          onChange={(e) => setNewProb({ ...newProb, constraints: e.target.value })}
                          placeholder="1 <= N <= 10^5&#10;Time Limit: 2000ms"
                          className="w-full border border-[#C6C1B0] p-2 rounded h-16 font-mono text-xs"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Time Limit (ms)</label>
                          <input
                            type="number"
                            value={newProb.time_limit_ms}
                            onChange={(e) => setNewProb({ ...newProb, time_limit_ms: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Memory Limit (MB)</label>
                          <input
                            type="number"
                            value={newProb.memory_limit_mb}
                            onChange={(e) => setNewProb({ ...newProb, memory_limit_mb: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 pt-3 border-t border-[#DBD7C9]">
                        <button
                          type="button"
                          onClick={() => setShowAddProbModal(false)}
                          className="px-3.5 py-1.5 border border-[#C6C1B0] rounded text-xs hover:bg-[#F6F6F2]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B]"
                        >
                          Create Problem
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Add Test Case Modal */}
              {showAddTestCaseModal && selectedProblemForTestCase && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-6 max-w-lg w-full text-xs space-y-4 shadow-xl animate-in fade-in zoom-in-95">
                    <div className="border-b border-[#DBD7C9] pb-2">
                      <div className="text-[10.5px] font-mono uppercase font-bold text-[#1E7E34]">
                        P{selectedProblemForTestCase.order_num}: {selectedProblemForTestCase.title}
                      </div>
                      <h3 className="text-sm font-bold text-[#16233F]">Add Test Case</h3>
                    </div>

                    <form onSubmit={handleAddTestCase} className="space-y-3">
                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">
                          Standard Input (stdin)
                        </label>
                        <textarea
                          rows={4}
                          value={newTestCase.input_data}
                          onChange={(e) => setNewTestCase({ ...newTestCase, input_data: e.target.value })}
                          placeholder="e.g. 2,7,11,15|9"
                          className="w-full border border-[#C6C1B0] p-2 rounded font-mono text-xs focus:outline-none focus:border-[#16233F]"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">
                          Expected Output (stdout)
                        </label>
                        <textarea
                          rows={3}
                          value={newTestCase.expected_output}
                          onChange={(e) => setNewTestCase({ ...newTestCase, expected_output: e.target.value })}
                          placeholder="e.g. 0,1"
                          required
                          className="w-full border border-[#C6C1B0] p-2 rounded font-mono text-xs focus:outline-none focus:border-[#16233F]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Order #</label>
                          <input
                            type="number"
                            value={newTestCase.order_num}
                            onChange={(e) => setNewTestCase({ ...newTestCase, order_num: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Visibility Type</label>
                          <div className="flex items-center space-x-4 pt-1">
                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="is_hidden"
                                checked={!newTestCase.is_hidden}
                                onChange={() => setNewTestCase({ ...newTestCase, is_hidden: false })}
                              />
                              <span className="font-semibold text-[#1E7A46]">Public Sample</span>
                            </label>
                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="is_hidden"
                                checked={newTestCase.is_hidden}
                                onChange={() => setNewTestCase({ ...newTestCase, is_hidden: true })}
                              />
                              <span className="font-semibold text-[#C0392B]">Hidden Case</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 pt-3 border-t border-[#DBD7C9]">
                        <button
                          type="button"
                          onClick={() => setShowAddTestCaseModal(false)}
                          className="px-3.5 py-1.5 border border-[#C6C1B0] rounded text-xs hover:bg-[#F6F6F2]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-1.5 bg-[#1E7E34] text-white rounded text-xs font-semibold hover:bg-[#166027] disabled:opacity-50"
                        >
                          {loading ? 'Saving…' : 'Save Test Case'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: ORGANIZER TEAM (SUPERADMIN ONLY) */}
          {activeTab === 'organizers' && isSuperAdmin && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">Organizer Team Management</h2>
                  <p className="text-xs text-[#59626F]">
                    Create student coordinator accounts with restricted <strong>Leaderboard-only access</strong>.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddOrgModal(true)}
                  className="px-3 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] hover:bg-[#25355B]"
                >
                  + Add Organizer
                </button>
              </div>

              {/* Organizers Table */}
              <div className="bg-white border border-[#DBD7C9] rounded-[4px] overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F6F6F2] border-b border-[#DBD7C9] font-semibold text-[#16233F]">
                      <th className="py-2.5 px-3">Username</th>
                      <th className="py-2.5 px-3">Email</th>
                      <th className="py-2.5 px-3 text-center">Assigned Role</th>
                      <th className="py-2.5 px-3 text-center">Permissions</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DBD7C9]">
                    {organizers.map((o) => (
                      <tr key={o.id} className="hover:bg-[#F6F6F2]/50">
                        <td className="py-2.5 px-3 font-mono font-medium text-[#16233F]">{o.username}</td>
                        <td className="py-2.5 px-3 text-[#59626F]">{o.email}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-[2px] font-mono text-[10px] font-bold ${
                            o.role === 'SUPERADMIN' ? 'bg-[#3FB950]/20 text-[#248037] border border-[#3FB950]/40' : 'bg-[#E3B341]/20 text-[#9E6A03] border border-[#E3B341]/40'
                          }`}>
                            {o.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-[#59626F]">
                          {o.role === 'SUPERADMIN' ? 'Full Superadmin Control' : 'Leaderboard & Live Monitor Only'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {o.username !== 'admin' && o.id !== admin?.id ? (
                            <button
                              onClick={() => handleDeleteOrganizer(o.id, o.username)}
                              className="text-[#A82A2A] hover:underline font-mono text-[11px]"
                            >
                              Revoke Access
                            </button>
                          ) : (
                            <span className="text-[#8B93A0] text-[11px] font-mono">Current / Primary</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Organizer Modal */}
              {showAddOrgModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-[6px] max-w-md w-full p-6 shadow-xl border border-[#DBD7C9]">
                    <h3 className="font-serif text-lg font-bold text-[#16233F] mb-1">Add Organizer / Coordinator</h3>
                    <p className="text-xs text-[#59626F] mb-4">
                      Create credentials for event coordinators. Coordinators can only view the live leaderboard.
                    </p>
                    <form onSubmit={handleAddOrganizer} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Username</label>
                        <input
                          type="text"
                          required
                          value={newOrg.username}
                          onChange={(e) => setNewOrg({ ...newOrg, username: e.target.value })}
                          placeholder="e.g. coordinator_ai"
                          className="w-full border border-[#C6C1B0] p-2 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Institutional Email</label>
                        <input
                          type="email"
                          required
                          value={newOrg.email}
                          onChange={(e) => setNewOrg({ ...newOrg, email: e.target.value })}
                          placeholder="e.g. coord@rgmcet.edu.in"
                          className="w-full border border-[#C6C1B0] p-2 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Password</label>
                        <input
                          type="password"
                          required
                          value={newOrg.password}
                          onChange={(e) => setNewOrg({ ...newOrg, password: e.target.value })}
                          placeholder="••••••••"
                          className="w-full border border-[#C6C1B0] p-2 rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[#59626F] font-semibold mb-1">Access Level</label>
                        <select
                          value={newOrg.role}
                          onChange={(e) => setNewOrg({ ...newOrg, role: e.target.value })}
                          className="w-full border border-[#C6C1B0] p-2 rounded bg-white"
                        >
                          <option value="ORGANIZER">ORGANIZER (Restricted to Live Leaderboard Only)</option>
                          <option value="SUPERADMIN">SUPERADMIN (Full Control: Settings, Questions, Rounds)</option>
                        </select>
                      </div>

                      <div className="p-2.5 bg-[#F6F6F2] rounded border border-[#DBD7C9] text-[11px] text-[#59626F]">
                        🛡️ <strong>Security Note:</strong> Student organizers cannot view questions, edit marks, or access competition controls.
                      </div>

                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddOrgModal(false)}
                          className="px-3 py-1.5 border border-[#C6C1B0] rounded text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B]"
                        >
                          Create Account
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === 'settings' && isSuperAdmin && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[#16233F]">Competition Settings</h2>
                <p className="text-xs text-[#59626F]">Server-authoritative thresholds, timers, and violation limits</p>
              </div>

              <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-5 space-y-4">
                {settingsList.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border-b border-[#F6F6F2] pb-3 text-xs">
                    <div>
                      <div className="font-mono font-bold text-[#16233F]">{s.key}</div>
                      <div className="text-[11px] text-[#8B93A0]">Current value: {s.value}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        defaultValue={s.value}
                        id={`input-${s.key}`}
                        className="h-8 px-2 border border-[#C6C1B0] rounded-[3px] text-xs font-mono w-28 text-center"
                      />
                      <button
                        onClick={() => {
                          const val = (document.getElementById(`input-${s.key}`) as HTMLInputElement)?.value;
                          if (val) handleUpdateSetting(s.key, val);
                        }}
                        className="px-3 py-1.5 bg-[#16233F] text-white rounded-[3px] font-semibold text-[11px]"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: LEADERBOARD & EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">📊 Live Leaderboard</h2>
                  <p className="text-xs text-[#59626F]">Live verified rankings — auto-refreshes every 10 seconds</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => refreshActiveTab()}
                    disabled={isRefreshing}
                    className="px-3 py-1.5 border border-[#DBD7C9] text-[#16233F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2] flex items-center space-x-1"
                  >
                    <span className={isRefreshing ? 'animate-spin' : ''}>↺</span>
                    <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
                  </button>
                  <button
                    onClick={() => downloadCSV(
                      filteredLeaderboard,
                      `leaderboard_${lbFilter.toLowerCase()}${lbYearFilter ? `_y${lbYearFilter}` : ''}.csv`,
                      ['Rank','Roll Number','Name','Year','MCQ Score','Qualified','Coding Score','Total Score','Violations'],
                      ['rank','roll_number','name','academic_year','mcq_score','mcq_qualified','coding_score','total_score','violations']
                    )}
                    className="px-4 py-2 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] transition-colors flex items-center space-x-1.5"
                  >
                    <span>⬇ Download Filtered CSV ({filteredLeaderboard.length})</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Strip */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-[4px] border border-[#DBD7C9]">
                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Filter:</span>
                  <select
                    value={lbFilter}
                    onChange={(e) => setLbFilter(e.target.value as any)}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="ALL">All Participants</option>
                    <option value="QUALIFIED">✓ Qualified Only</option>
                    <option value="DISQUALIFIED">✗ Not Qualified</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Academic Year:</span>
                  <select
                    value={lbYearFilter}
                    onChange={(e) => setLbYearFilter(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Years (1–4)</option>
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={lbSearch}
                    onChange={(e) => setLbSearch(e.target.value)}
                    placeholder="Search by Roll Number or Name…"
                    className="h-8 px-3 text-xs border border-[#C6C1B0] rounded-[3px] w-full"
                  />
                </div>

                <div className="text-xs text-[#8B93A0] font-mono">
                  Showing <strong>{filteredLeaderboard.length}</strong> of {leaderboard.length} records
                </div>
              </div>

              <div className="bg-white border border-[#DBD7C9] rounded-[4px] overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F6F6F2] border-b border-[#DBD7C9] font-semibold text-[#16233F]">
                      <th className="py-2.5 px-3 text-center font-mono">Rank</th>
                      <th className="py-2.5 px-3 font-mono">Roll Number</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3 text-center">Year</th>
                      <th className="py-2.5 px-3 text-center">MCQ Score</th>
                      <th className="py-2.5 px-3 text-center">Coding Score</th>
                      <th className="py-2.5 px-3 text-center font-bold">Total Score</th>
                      <th className="py-2.5 px-3 text-center">Violations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DBD7C9]">
                    {filteredLeaderboard.map((e) => (
                      <tr key={e.participant_id} className={`hover:bg-[#F6F6F2]/50 ${e.rank <= 3 ? 'bg-[#FFFBEB]' : ''}`}>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#16233F]">
                          {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#16233F]">{e.roll_number}</td>
                        <td className="py-2.5 px-3 font-medium">{e.name}</td>
                        <td className="py-2.5 px-3 text-center">{e.academic_year}</td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {e.mcq_score !== null ? `${e.mcq_score} / 25` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {e.coding_score !== null ? `${e.coding_score}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1E7E34]">
                          {e.total_score}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span className={e.violations > 0 ? 'text-[#A82A2A] font-bold' : 'text-[#8B93A0]'}>
                            {e.violations}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLeaderboard.length === 0 && (
                  <p className="text-xs text-[#8B93A0] text-center py-8">No participants match the selected filter.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: ROUND 1 WINNERS */}
          {activeTab === 'winners1' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">🥇 Round 1 — MCQ Results</h2>
                  <p className="text-xs text-[#59626F]">All participants ranked by MCQ score. Filter by qualification status or year.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => refreshActiveTab()}
                    disabled={isRefreshing}
                    className="px-3 py-1.5 border border-[#DBD7C9] text-[#16233F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2] flex items-center space-x-1"
                  >
                    <span className={isRefreshing ? 'animate-spin' : ''}>↺</span>
                    <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
                  </button>
                  <button
                    onClick={() => downloadCSV(
                      filteredWinners1,
                      `round1_mcq_results_${r1Filter.toLowerCase()}${r1YearFilter ? `_y${r1YearFilter}` : ''}.csv`,
                      ['Rank','Roll Number','Name','Year','MCQ Score (/ 25)','Qualified for Round 2','Violations'],
                      ['r1_rank','roll_number','name','academic_year','mcq_score','mcq_qualified','violations']
                    )}
                    className="px-4 py-2 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] transition-colors flex items-center space-x-1.5"
                  >
                    <span>⬇ Download Filtered CSV ({filteredWinners1.length})</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Strip */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-[4px] border border-[#DBD7C9]">
                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Qualification:</span>
                  <select
                    value={r1Filter}
                    onChange={(e) => setR1Filter(e.target.value as any)}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="ALL">All Participants ({winners1.length})</option>
                    <option value="QUALIFIED">✓ Qualified for Round 2 Only ({winners1.filter(w => w.mcq_qualified).length})</option>
                    <option value="DISQUALIFIED">✗ Not Qualified ({winners1.filter(w => !w.mcq_qualified).length})</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Academic Year:</span>
                  <select
                    value={r1YearFilter}
                    onChange={(e) => setR1YearFilter(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Years (1–4)</option>
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={r1Search}
                    onChange={(e) => setR1Search(e.target.value)}
                    placeholder="Search by Roll Number or Name…"
                    className="h-8 px-3 text-xs border border-[#C6C1B0] rounded-[3px] w-full"
                  />
                </div>

                <div className="text-xs text-[#8B93A0] font-mono">
                  Showing <strong>{filteredWinners1.length}</strong> records
                </div>
              </div>

              {filteredWinners1.length >= 3 && (
                <div className="grid grid-cols-3 gap-3">
                  {[filteredWinners1[1], filteredWinners1[0], filteredWinners1[2]].map((w, i) => (
                    <div key={w?.participant_id} className={`rounded-[6px] p-4 border-2 text-center ${
                      i === 1 ? 'border-[#E3B341] bg-[#FFFBEB]' : i === 0 ? 'border-[#8B93A0] bg-[#F6F6F2]' : 'border-[#CD7F32] bg-[#FFF5EE]'
                    }`}>
                      <div className="text-3xl mb-1">{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
                      <div className="font-bold text-[#16233F] text-sm">{w?.name}</div>
                      <div className="text-[11px] text-[#59626F] font-mono">{w?.roll_number}</div>
                      <div className="text-xl font-bold font-mono text-[#16233F] mt-2">
                        {w?.mcq_score}<span className="text-sm text-[#8B93A0]">/25</span>
                      </div>
                      <div className={`text-[10px] mt-1 font-bold ${w?.mcq_qualified ? 'text-[#1E7E34]' : 'text-[#A82A2A]'}`}>
                        {w?.mcq_qualified ? '✓ QUALIFIED' : '✗ NOT QUALIFIED'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-white border border-[#DBD7C9] rounded-[4px] overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F6F6F2] border-b border-[#DBD7C9] font-semibold text-[#16233F]">
                      <th className="py-2.5 px-3 text-center font-mono">Rank</th>
                      <th className="py-2.5 px-3 font-mono">Roll Number</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3 text-center">Year</th>
                      <th className="py-2.5 px-3 text-center">MCQ Score</th>
                      <th className="py-2.5 px-3 text-center">Qualified</th>
                      <th className="py-2.5 px-3 text-center">Violations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DBD7C9]">
                    {filteredWinners1.map((e) => (
                      <tr key={e.participant_id} className={`${e.mcq_qualified ? 'bg-[#F0FBF4]' : ''} hover:bg-[#F6F6F2]/70`}>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#16233F]">
                          {e.r1_rank === 1 ? '🥇' : e.r1_rank === 2 ? '🥈' : e.r1_rank === 3 ? '🥉' : `#${e.r1_rank}`}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#16233F]">{e.roll_number}</td>
                        <td className="py-2.5 px-3 font-semibold">{e.name}</td>
                        <td className="py-2.5 px-3 text-center">{e.academic_year}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">{e.mcq_score} / 25</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold ${e.mcq_qualified ? 'bg-[#E8F3EC] text-[#1E7E34]' : 'bg-[#FDEDEC] text-[#A82A2A]'}`}>
                            {e.mcq_qualified ? 'QUALIFIED' : 'NOT QUALIFIED'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span className={e.violations > 0 ? 'text-[#A82A2A] font-bold' : 'text-[#8B93A0]'}>{e.violations}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredWinners1.length === 0 && (
                  <p className="text-xs text-[#8B93A0] text-center py-8">No results match your filter criteria.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 8: ROUND 2 WINNERS */}
          {activeTab === 'winners2' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">🏆 Round 2 — Coding Results</h2>
                  <p className="text-xs text-[#59626F]">Ranked by Total Score (MCQ + Coding). Gold = top 3 finalists.</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => refreshActiveTab()}
                    disabled={isRefreshing}
                    className="px-3 py-1.5 border border-[#DBD7C9] text-[#16233F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2] flex items-center space-x-1"
                  >
                    <span className={isRefreshing ? 'animate-spin' : ''}>↺</span>
                    <span>{isRefreshing ? 'Refreshing…' : 'Refresh'}</span>
                  </button>
                  <button
                    onClick={() => downloadCSV(
                      filteredWinners2,
                      `round2_coding_results${r2YearFilter ? `_y${r2YearFilter}` : ''}.csv`,
                      ['Rank','Roll Number','Name','Year','MCQ Score','Coding Score','Total Score','Violations'],
                      ['r2_rank','roll_number','name','academic_year','mcq_score','coding_score','total_score','violations']
                    )}
                    className="px-4 py-2 bg-[#C0392B] text-white text-xs font-bold rounded-[3px] hover:bg-[#A82A2A] transition-colors flex items-center space-x-1.5"
                  >
                    <span>⬇ Download Filtered CSV ({filteredWinners2.length})</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Strip */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-[4px] border border-[#DBD7C9]">
                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Academic Year:</span>
                  <select
                    value={r2YearFilter}
                    onChange={(e) => setR2YearFilter(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Years (1–4)</option>
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={r2Search}
                    onChange={(e) => setR2Search(e.target.value)}
                    placeholder="Search by Roll Number or Name…"
                    className="h-8 px-3 text-xs border border-[#C6C1B0] rounded-[3px] w-full"
                  />
                </div>

                <div className="text-xs text-[#8B93A0] font-mono">
                  Showing <strong>{filteredWinners2.length}</strong> of {winners2.length} records
                </div>
              </div>

              {filteredWinners2.length >= 3 && (
                <div className="grid grid-cols-3 gap-3">
                  {[filteredWinners2[1], filteredWinners2[0], filteredWinners2[2]].map((w, i) => (
                    <div key={w?.participant_id} className={`rounded-[6px] p-4 border-2 text-center ${
                      i === 1 ? 'border-[#E3B341] bg-[#FFFBEB]' : i === 0 ? 'border-[#8B93A0] bg-[#F6F6F2]' : 'border-[#CD7F32] bg-[#FFF5EE]'
                    }`}>
                      <div className="text-3xl mb-1">{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
                      <div className="font-bold text-[#16233F] text-sm">{w?.name}</div>
                      <div className="text-[11px] text-[#59626F] font-mono">{w?.roll_number}</div>
                      <div className="text-xl font-bold font-mono text-[#16233F] mt-2">
                        {w?.total_score}<span className="text-sm text-[#8B93A0]"> pts</span>
                      </div>
                      <div className="text-[10px] text-[#59626F] mt-0.5">MCQ: {w?.mcq_score}/25 · Code: {w?.coding_score}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-white border border-[#DBD7C9] rounded-[4px] overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F6F6F2] border-b border-[#DBD7C9] font-semibold text-[#16233F]">
                      <th className="py-2.5 px-3 text-center font-mono">Rank</th>
                      <th className="py-2.5 px-3 font-mono">Roll Number</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3 text-center">Year</th>
                      <th className="py-2.5 px-3 text-center">MCQ</th>
                      <th className="py-2.5 px-3 text-center">Coding</th>
                      <th className="py-2.5 px-3 text-center font-bold">Total</th>
                      <th className="py-2.5 px-3 text-center">Violations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DBD7C9]">
                    {filteredWinners2.map((e) => (
                      <tr key={e.participant_id} className={`${e.r2_rank <= 3 ? 'bg-[#FFFBEB]' : ''} hover:bg-[#F6F6F2]/70`}>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#16233F]">
                          {e.r2_rank === 1 ? '🥇' : e.r2_rank === 2 ? '🥈' : e.r2_rank === 3 ? '🥉' : `#${e.r2_rank}`}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#16233F]">{e.roll_number}</td>
                        <td className="py-2.5 px-3 font-semibold">{e.name}</td>
                        <td className="py-2.5 px-3 text-center">{e.academic_year}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{e.mcq_score ?? '—'} / 25</td>
                        <td className="py-2.5 px-3 text-center font-mono">{e.coding_score ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1E7E34] text-sm">{e.total_score}</td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span className={e.violations > 0 ? 'text-[#A82A2A] font-bold' : 'text-[#8B93A0]'}>{e.violations}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredWinners2.length === 0 && (
                  <p className="text-xs text-[#8B93A0] text-center py-8">No results match your filter criteria.</p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
