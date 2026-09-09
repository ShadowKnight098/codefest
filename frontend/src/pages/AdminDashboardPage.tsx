import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { apiFetch } from '../api/client';

type Tab = 'overview' | 'participants' | 'mcq' | 'coding' | 'settings' | 'export' | 'organizers' | 'winners1' | 'winners2' | 'presentation';

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

  // Emergency Reassign / Technical Reset Modal
  const [selectedParticipantForEmergency, setSelectedParticipantForEmergency] = useState<any>(null);

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

  // Level 2 Debugging Bank tab state
  const [problems, setProblems] = useState<any[]>([]);
  const [l2PoolStats, setL2PoolStats] = useState<any>(null);
  const [l2YearFilter, setL2YearFilter] = useState<number | ''>('');
  const [l2DiffFilter, setL2DiffFilter] = useState<string>('');
  const [l2Search, setL2Search] = useState<string>('');
  const [l2ImportFile, setL2ImportFile] = useState<File | null>(null);
  const [l2UploadMode, setL2UploadMode] = useState<'file' | 'paste'>('file');
  const [l2PasteText, setL2PasteText] = useState<string>('');
  const [l2Overwrite, setL2Overwrite] = useState<boolean>(false);
  const [isL2Dragging, setIsL2Dragging] = useState<boolean>(false);
  const [l2PreviewData, setL2PreviewData] = useState<any>(null);
  const [showL2PreviewModal, setShowL2PreviewModal] = useState<boolean>(false);
  const [showAddProbModal, setShowAddProbModal] = useState<boolean>(false);
  const [showEditProbModal, setShowEditProbModal] = useState<boolean>(false);
  const [editProbForm, setEditProbForm] = useState<any>(null);
  const [showL2QuotaModal, setShowL2QuotaModal] = useState<boolean>(false);
  const [quotaForm, setQuotaForm] = useState({ quota_easy: 5, quota_medium: 5, quota_hard: 5 });
  const [newL2Question, setNewL2Question] = useState({
    question_id: '',
    academic_year: 2,
    language: 'python',
    difficulty: 'medium',
    question: '',
    code: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_answer: 'a',
    marks: 1
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
  const [r1TopLimit, setR1TopLimit] = useState<number | ''>('');

  // Round 2 Filter state
  const [r2YearFilter, setR2YearFilter] = useState<number | ''>('');
  const [r2Search, setR2Search] = useState<string>('');
  const [r2TopLimit, setR2TopLimit] = useState<number | ''>('');

  // Leaderboard Filter state
  const [lbFilter, setLbFilter] = useState<'ALL' | 'QUALIFIED' | 'DISQUALIFIED'>('ALL');
  const [lbYearFilter, setLbYearFilter] = useState<number | ''>('');
  const [lbSearch, setLbSearch] = useState<string>('');
  const [lbTopLimit, setLbTopLimit] = useState<number | ''>('');

  // Presentation (Level 3) state
  const [finalists, setFinalists] = useState<any[]>([]);
  const [presFilter, setPresFilter] = useState<'ALL' | 'EVALUATED' | 'PENDING'>('ALL');
  const [presYearFilter, setPresYearFilter] = useState<number | ''>('');
  const [presSearch, setPresSearch] = useState<string>('');
  const [presTopLimit, setPresTopLimit] = useState<number | ''>('');
  const [selectedFinalistForGrade, setSelectedFinalistForGrade] = useState<any | null>(null);
  const [gradeForm, setGradeForm] = useState({
    presentation_score: 0,
    technical_score: 0,
    viva_score: 0,
    remarks: '',
  });
  const [isGradingSubmitting, setIsGradingSubmitting] = useState<boolean>(false);
  const [showPromoteModal, setShowPromoteModal] = useState<boolean>(false);
  const [promoteTopN, setPromoteTopN] = useState<number>(10);
  const [promoteCutoff, setPromoteCutoff] = useState<number>(20);
  const [isPromoting, setIsPromoting] = useState<boolean>(false);


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
      let url = '/admin/coding-problems?limit=500';
      if (l2YearFilter) url += `&academic_year=${l2YearFilter}`;
      if (l2DiffFilter) url += `&difficulty=${l2DiffFilter}`;
      if (l2Search) url += `&search=${encodeURIComponent(l2Search)}`;
      const data = await apiFetch<any[]>(url);
      setProblems(Array.isArray(data) ? data : []);

      // Also fetch pool stats
      const stats = await apiFetch<any>('/admin/coding-problems/pool-stats');
      setL2PoolStats(stats);
      if (stats?.quotas) {
        setQuotaForm({
          quota_easy: stats.quotas.easy,
          quota_medium: stats.quotas.medium,
          quota_hard: stats.quotas.hard,
        });
      }
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
      // Round 2 winners / finalists = those with coding_score !== null or who qualified from Round 1
      const r2 = (Array.isArray(data) ? data : [])
        .filter((e: any) => e.coding_score !== null || e.mcq_qualified)
        .sort((a: any, b: any) => ((b.coding_score || 0) - (a.coding_score || 0)) || ((b.total_score || 0) - (a.total_score || 0)) || ((a.violations || 0) - (b.violations || 0)))
        .map((e: any, i: number) => ({ ...e, r2_rank: i + 1 }));
      setWinners2(r2);
    } catch (e) {
      console.error(e);
      setWinners2([]);
    }
  };

  const fetchFinalists = async () => {
    try {
      const data = await apiFetch<any[]>('/admin/presentation/finalists');
      setFinalists(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setFinalists([]);
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
      else if (activeTab === 'presentation') await fetchFinalists();
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
    if (!isSuperAdmin && activeTab !== 'export' && activeTab !== 'winners1' && activeTab !== 'winners2' && activeTab !== 'presentation') {
      setActiveTab('export');
      return;
    }
    refreshActiveTab();
  }, [activeTab, yearFilter, search, qYearFilter, l2YearFilter, l2DiffFilter, l2Search, isSuperAdmin]);

  // Periodic Live Auto-Sync (10 seconds to optimize server load)
  useEffect(() => {
    if (!autoSync) return;
    const interval = setInterval(() => {
      refreshActiveTab();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoSync, activeTab, yearFilter, search, qYearFilter, l2YearFilter, l2DiffFilter, l2Search, isSuperAdmin]);

  const filteredWinners1 = winners1
    .filter((w) => {
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
    })
    .slice(0, r1TopLimit ? Number(r1TopLimit) : undefined);

  const filteredWinners2 = winners2
    .filter((w) => {
      if (r2YearFilter && w.academic_year !== r2YearFilter) return false;
      if (r2Search) {
        const s = r2Search.toLowerCase();
        return (
          w.roll_number?.toLowerCase().includes(s) ||
          w.name?.toLowerCase().includes(s)
        );
      }
      return true;
    })
    .slice(0, r2TopLimit ? Number(r2TopLimit) : undefined);

  const filteredLeaderboard = leaderboard
    .filter((w) => {
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
    })
    .slice(0, lbTopLimit ? Number(lbTopLimit) : undefined);

  const filteredFinalists = finalists
    .filter((f) => {
      if (presFilter === 'EVALUATED' && f.status !== 'EVALUATED') return false;
      if (presFilter === 'PENDING' && f.status !== 'PENDING') return false;
      if (presYearFilter && f.academic_year !== presYearFilter) return false;
      if (presSearch) {
        const s = presSearch.toLowerCase();
        return (
          f.roll_number?.toLowerCase().includes(s) ||
          f.name?.toLowerCase().includes(s)
        );
      }
      return true;
    })
    .slice(0, presTopLimit ? Number(presTopLimit) : undefined);

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinalistForGrade) return;
    setIsGradingSubmitting(true);
    try {
      await apiFetch('/admin/presentation/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          participant_id: selectedFinalistForGrade.participant_id,
          presentation_score: Number(gradeForm.presentation_score || 0),
          technical_score: Number(gradeForm.technical_score || 0),
          viva_score: Number(gradeForm.viva_score || 0),
          remarks: gradeForm.remarks || '',
        }),
      });
      setMessage(`Marks assigned successfully for ${selectedFinalistForGrade.roll_number} (${selectedFinalistForGrade.name}).`);
      setSelectedFinalistForGrade(null);
      await fetchFinalists();
      await fetchLeaderboard();
    } catch (err: any) {
      alert(`Evaluation failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setIsGradingSubmitting(false);
    }
  };

  const handlePromoteByCutoff = async () => {
    if (!promoteCutoff) return;
    setIsPromoting(true);
    try {
      const res = await apiFetch<any>('/admin/presentation/promote-l2-finalists', {
        method: 'POST',
        body: JSON.stringify({ min_coding_score: Number(promoteCutoff) }),
      });
      setMessage(res.message || 'Participants promoted to Level 3 successfully.');
      setShowPromoteModal(false);
      await fetchFinalists();
    } catch (err: any) {
      alert(`Promotion failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setIsPromoting(false);
    }
  };

  const handlePromoteTopN = async () => {
    if (!promoteTopN) return;
    setIsPromoting(true);
    try {
      // Find top N from winners2
      const topParts = winners2.slice(0, Number(promoteTopN)).map((w: any) => w.participant_id);
      const res = await apiFetch<any>('/admin/presentation/promote-l2-finalists', {
        method: 'POST',
        body: JSON.stringify({ participant_ids: topParts }),
      });
      setMessage(res.message || `Promoted top ${promoteTopN} participants to Level 3.`);
      setShowPromoteModal(false);
      await fetchFinalists();
    } catch (err: any) {
      alert(`Promotion failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setIsPromoting(false);
    }
  };

  const toggleRound = async (roundId: string, currentStatus: boolean) => {
    // 1. Instant Optimistic State Update
    setRounds((prev) => prev.map((r) => r.id === roundId ? { ...r, is_open: !currentStatus } : r));
    try {
      await apiFetch(`/admin/rounds/${roundId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_open: !currentStatus }),
      });
      setMessage(`Round ${!currentStatus ? 'OPENED' : 'CLOSED'} successfully.`);
    } catch (e: any) {
      // Revert if network error
      setRounds((prev) => prev.map((r) => r.id === roundId ? { ...r, is_open: currentStatus } : r));
      alert(`Failed to toggle round: ${e?.detail || e.message}`);
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

  const handleBulkDeleteMCQQuestions = async () => {
    const yearText = qYearFilter ? `Year ${qYearFilter}` : 'ALL academic years';
    if (!confirm(`Are you sure you want to delete all MCQ questions for ${yearText}? This action cannot be undone!`)) return;
    setLoading(true);
    try {
      const url = qYearFilter ? `/admin/mcq-questions?academic_year=${qYearFilter}&confirm=true` : `/admin/mcq-questions?confirm=true`;
      const res = await apiFetch<any>(url, { method: 'DELETE' });
      setMessage(res.message || 'Questions deleted successfully.');
      fetchQuestions();
    } catch (e: any) {
      alert(`Delete failed: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Level 2 Debugging Challenge Handlers
  const handlePreviewL2Upload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let res: any;
      if (l2UploadMode === 'file') {
        if (!l2ImportFile) return;
        const formData = new FormData();
        formData.append('file', l2ImportFile);
        res = await apiFetch<any>(`/admin/coding-problems/preview-csv?overwrite=${l2Overwrite}`, {
          method: 'POST',
          body: formData,
        });
      } else {
        if (!l2PasteText.trim()) return;
        res = await apiFetch<any>('/admin/coding-problems/preview-text', {
          method: 'POST',
          body: JSON.stringify({ raw_text: l2PasteText, overwrite: l2Overwrite }),
        });
      }
      setL2PreviewData(res);
      setShowL2PreviewModal(true);
    } catch (err: any) {
      alert(`Validation Failed: ${err?.detail || err?.message || 'Parse error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCommitL2Import = async () => {
    setLoading(true);
    try {
      let res: any;
      if (l2UploadMode === 'file') {
        if (!l2ImportFile) return;
        const formData = new FormData();
        formData.append('file', l2ImportFile);
        res = await apiFetch<any>(`/admin/coding-problems/import?overwrite=${l2Overwrite}`, {
          method: 'POST',
          body: formData,
        });
      } else {
        if (!l2PasteText.trim()) return;
        res = await apiFetch<any>('/admin/coding-problems/import-text', {
          method: 'POST',
          body: JSON.stringify({ raw_text: l2PasteText, overwrite: l2Overwrite }),
        });
      }
      setMessage(res.message || 'Import completed successfully.');
      setShowL2PreviewModal(false);
      setL2ImportFile(null);
      setL2PasteText('');
      await fetchProblems();
    } catch (err: any) {
      alert(`Import Failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDemoQuestions = async () => {
    if (!confirm('This will seed competition-grade debugging questions (5 Easy, 5 Medium, 3 Hard for both Year 2 & Year 3) in Python, C, and Java. Proceed?')) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>('/admin/coding-problems/seed-demo', {
        method: 'POST'
      });
      setMessage(res.message || 'Demo questions seeded successfully.');
      await fetchProblems();
    } catch (err: any) {
      alert(`Seed failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllL2Questions = async () => {
    const entered = prompt('⚠️ CAUTION: This will delete all Level 2 Debugging Questions from the database!\nType "DELETE" to confirm:');
    if (entered !== 'DELETE') return;
    setLoading(true);
    try {
      const res = await apiFetch<any>('/admin/coding-problems?confirm=true', {
        method: 'DELETE'
      });
      setMessage(res.message || 'All Level 2 questions deleted.');
      await fetchProblems();
    } catch (err: any) {
      alert(`Clear failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadL2Template = () => {
    const headers = [
      'question_id', 'academic_year', 'language', 'difficulty',
      'question', 'code', 'option_a', 'option_b', 'option_c', 'option_d',
      'correct_answer', 'marks'
    ];
    const sampleRows = [
      {
        question_id: 'L2_Y2_001',
        academic_year: '2',
        language: 'python',
        difficulty: 'easy',
        question: 'Identify the missing line to correctly compute the sum of even numbers.',
        code: 'def sum_even(nums):\\n    total = 0\\n    for n in nums:\\n        // [ MISSING LINE HERE ]\\n            total += n\\n    return total',
        option_a: 'if n % 2 == 0:',
        option_b: 'if n % 2 != 0:',
        option_c: 'if total % 2 == 0:',
        option_d: 'if n > 0:',
        correct_answer: 'a',
        marks: '1'
      },
      {
        question_id: 'L2_Y2_002',
        academic_year: '2',
        language: 'c',
        difficulty: 'medium',
        question: 'Supply the missing termination base case for recursive factorial.',
        code: 'long long factorial(int n) {\\n    // [ MISSING LINE HERE ]\\n        return 1;\\n    return n * factorial(n - 1);\\n}',
        option_a: 'if (n <= 1)',
        option_b: 'if (n == 2)',
        option_c: 'if (n > 1)',
        option_d: 'if (factorial(n) == 1)',
        correct_answer: 'a',
        marks: '2'
      },
      {
        question_id: 'L2_Y3_001',
        academic_year: '3',
        language: 'python',
        difficulty: 'medium',
        question: 'Complete the binary search algorithm to find the target index.',
        code: 'def binary_search(arr, target):\\n    low, high = 0, len(arr) - 1\\n    while low <= high:\\n        // [ MISSING LINE HERE ]\\n        if arr[mid] == target:\\n            return mid\\n        elif arr[mid] < target:\\n            low = mid + 1\\n        else:\\n            high = mid - 1\\n    return -1',
        option_a: 'mid = (low + high) // 2',
        option_b: 'mid = (low + high) / 2',
        option_c: 'mid = high - low // 2',
        option_d: 'mid = (low + high) * 2',
        correct_answer: 'a',
        marks: '2'
      },
      {
        question_id: 'L2_Y3_002',
        academic_year: '3',
        language: 'java',
        difficulty: 'hard',
        question: 'Supply the final pivot positioning swap in Lomuto QuickSort Partition.',
        code: 'int partition(int[] arr, int low, int high) {\\n    int pivot = arr[high];\\n    int i = low - 1;\\n    for (int j = low; j < high; j++) {\\n        if (arr[j] <= pivot) {\\n            i++;\\n            swap(arr, i, j);\\n        }\\n    }\\n    // [ MISSING LINE HERE ]\\n    return i + 1;\\n}',
        option_a: 'swap(arr, i + 1, high);',
        option_b: 'swap(arr, low, high);',
        option_c: 'swap(arr, i, high);',
        option_d: 'arr[i + 1] = pivot;',
        correct_answer: 'a',
        marks: '3'
      }
    ];

    downloadCSV(sampleRows, 'level2_debugging_template.csv', headers, headers);
  };

  const handleAddL2Question = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch('/admin/coding-problems', {
        method: 'POST',
        body: JSON.stringify(newL2Question),
      });
      setMessage(`Question "${newL2Question.question_id}" created successfully.`);
      setShowAddProbModal(false);
      setNewL2Question({
        question_id: '',
        academic_year: 2,
        language: 'python',
        difficulty: 'medium',
        question: '',
        code: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_answer: 'a',
        marks: 1
      });
      fetchProblems();
    } catch (err: any) {
      alert(`Failed to add question: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateL2Question = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProbForm) return;
    setLoading(true);
    try {
      await apiFetch(`/admin/coding-problems/${editProbForm.id}`, {
        method: 'PUT',
        body: JSON.stringify(editProbForm),
      });
      setMessage(`Question "${editProbForm.question_id}" updated successfully.`);
      setShowEditProbModal(false);
      setEditProbForm(null);
      fetchProblems();
    } catch (err: any) {
      alert(`Update failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteL2Question = async (id: string, qid: string) => {
    if (!confirm(`Are you sure you want to delete question "${qid}"?`)) return;
    try {
      await apiFetch(`/admin/coding-problems/${id}`, { method: 'DELETE' });
      setMessage(`Question "${qid}" deleted.`);
      fetchProblems();
    } catch (err: any) {
      alert(`Delete failed: ${err?.detail || err?.message || 'Server error'}`);
    }
  };

  const handleUpdateQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<any>('/admin/coding-problems/quotas', {
        method: 'POST',
        body: JSON.stringify({
          quota_easy: Number(quotaForm.quota_easy),
          quota_medium: Number(quotaForm.quota_medium),
          quota_hard: Number(quotaForm.quota_hard),
        }),
      });
      setMessage(res.message || 'Quotas updated successfully.');
      setShowL2QuotaModal(false);
      fetchProblems();
    } catch (err: any) {
      alert(`Failed to update quotas: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setLoading(false);
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

  const handleResetLevel1 = async (p: any) => {
    const partId = p?.id || p?.participant_id;
    if (!partId) return alert('Participant ID not found.');
    if (!confirm(`Are you sure you want to completely RESET Level 1 (MCQ Assessment) for ${p.roll_number} (${p.name})?\n\nThis will clear their previous attempt, answers, violations, and timer, letting them start Level 1 freshly.`)) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/admin/participants/${partId}/reset-level1`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      alert(res.message || `Level 1 reset for ${p.roll_number}.`);
      setMessage(res.message);
      setSelectedParticipantForEmergency(null);
      if (isSuperAdmin) fetchParticipants();
      fetchWinners1();
      fetchLeaderboard();
      fetchOverview();
    } catch (e: any) {
      alert(`Failed to reset Level 1: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetLevel2 = async (p: any) => {
    const partId = p?.id || p?.participant_id;
    if (!partId) return alert('Participant ID not found.');
    if (!confirm(`Are you sure you want to completely RESET Level 2 (Coding Assessment) for ${p.roll_number} (${p.name})?\n\nThis will clear their coding submissions, violations, and timer, letting them start Level 2 freshly.`)) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/admin/participants/${partId}/reset-level2`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      alert(res.message || `Level 2 reset for ${p.roll_number}.`);
      setMessage(res.message);
      setSelectedParticipantForEmergency(null);
      if (isSuperAdmin) fetchParticipants();
      fetchWinners2();
      fetchLeaderboard();
      fetchOverview();
    } catch (e: any) {
      alert(`Failed to reset Level 2: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideLevel2 = async (p: any, explicitStatus?: boolean) => {
    const partId = p?.id || p?.participant_id;
    if (!partId) return alert('Participant ID not found.');
    const isQualifying = explicitStatus !== undefined ? explicitStatus : !p.mcq_qualified;
    const actionName = isQualifying ? 'QUALIFY' : 'DISQUALIFY';
    if (!confirm(`Are you sure you want to ${actionName} ${p.roll_number} (${p.name}) for Level 2 (Coding)?\n\nThis allows the student to immediately enter Level 2.`)) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/admin/participants/${partId}/override-level2-qualification`, {
        method: 'POST',
        body: JSON.stringify({ is_qualified: isQualifying })
      });
      alert(res.message || `${p.roll_number} qualification updated.`);
      setMessage(res.message);
      setSelectedParticipantForEmergency(null);
      if (isSuperAdmin) fetchParticipants();
      fetchWinners1();
      fetchWinners2();
      fetchLeaderboard();
      fetchOverview();
    } catch (e: any) {
      alert(`Failed to qualify for Level 2: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickToggleQualify = async (participantId: string, roll: string, name: string, currentQualified: boolean) => {
    const nextAction = currentQualified ? 'DISQUALIFY from' : 'QUALIFY for';
    if (!confirm(`Are you sure you want to ${nextAction} Level 2 (Coding) for ${roll} (${name})?`)) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/admin/participants/${participantId}/override-level2-qualification`, {
        method: 'POST',
        body: JSON.stringify({ is_qualified: !currentQualified })
      });
      setMessage(res.message || `Updated qualification for ${roll}.`);
      await fetchWinners1();
      await fetchWinners2();
      await fetchLeaderboard();
      await fetchOverview();
      if (isSuperAdmin) await fetchParticipants();
    } catch (e: any) {
      alert(`Failed to update qualification: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
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
        { id: 'presentation' as Tab, label: '🎤 Level 3 Evaluation' },
        { id: 'participants' as Tab, label: 'Participants' },
        { id: 'mcq' as Tab, label: 'MCQ Bank Manager' },
        { id: 'coding' as Tab, label: 'L2 Debugging Bank' },
        { id: 'organizers' as Tab, label: 'Organizer Team' },
        { id: 'settings' as Tab, label: 'Competition Settings' },
      ]
    : [
        { id: 'export' as Tab, label: '📊 Live Leaderboard' },
        { id: 'winners1' as Tab, label: '🥇 Round 1 Results' },
        { id: 'winners2' as Tab, label: '🏆 Round 2 Results' },
        { id: 'presentation' as Tab, label: '🎤 Level 3 Evaluation' },
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                      onClick={() => toggleRound(r.id, r.is_open)}
                      className={`w-full py-2.5 text-xs font-bold rounded-[3px] transition-all shadow-sm active:scale-[0.98] ${
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
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            onClick={() => setSelectedParticipantForEmergency(p)}
                            className="px-2 py-0.5 bg-[#16233F] text-white rounded text-[10.5px] font-semibold hover:bg-[#25355B] transition-colors inline-flex items-center space-x-1"
                            title="Emergency Technical Reset & Reassignment (Level 1, Level 2, or Direct Qualification)"
                          >
                            <span>⚙️</span>
                            <span>Reassign / Fix</span>
                          </button>
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

              {/* Year Filter & Bulk Delete */}
              <div className="flex items-center justify-between">
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
                {questions.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkDeleteMCQQuestions}
                    disabled={loading}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-[3px] flex items-center space-x-1.5 disabled:opacity-50 transition"
                  >
                    <span>🗑️</span>
                    <span>Delete {qYearFilter ? `Year ${qYearFilter}` : 'All'} Questions</span>
                  </button>
                )}
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

          {/* TAB 4: LEVEL 2 DEBUGGING QUESTION BANK */}
          {activeTab === 'coding' && isSuperAdmin && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">Level 2 Debugging Question Bank</h2>
                  <p className="text-xs text-[#59626F]">
                    Missing-Line MCQ challenges with read-only code snippets. Exclusively for Academic Years 2 and 3.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleDownloadL2Template}
                    className="px-3 py-1.5 bg-[#EEF1F6] text-[#16233F] border border-[#CBD5E1] text-xs font-semibold rounded-[3px] hover:bg-[#E2E8F0] transition-colors"
                  >
                    📥 CSV Template
                  </button>
                  <button
                    onClick={handleSeedDemoQuestions}
                    disabled={loading}
                    className="px-3 py-1.5 bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF] text-xs font-semibold rounded-[3px] hover:bg-[#D4EFDF] transition-colors disabled:opacity-50"
                  >
                    ⚡ Seed Demo Questions
                  </button>
                  <button
                    onClick={handleClearAllL2Questions}
                    disabled={loading}
                    className="px-3 py-1.5 bg-[#FDEDEC] text-[#C0392B] border border-[#F5B7B1] text-xs font-semibold rounded-[3px] hover:bg-[#FADBD8] transition-colors disabled:opacity-50"
                  >
                    🗑️ Clear Questions
                  </button>
                  <button
                    onClick={() => setShowL2QuotaModal(true)}
                    className="px-3 py-1.5 bg-[#EEF1F6] text-[#16233F] border border-[#CBD5E1] text-xs font-semibold rounded-[3px] hover:bg-[#E2E8F0] transition-colors"
                  >
                    ⚙ Configure Quotas
                  </button>
                  <button
                    onClick={() => setShowAddProbModal(true)}
                    className="px-3.5 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] hover:bg-[#25355B] transition-colors"
                  >
                    + Add Question
                  </button>
                </div>
              </div>

              {/* Pool Status & Quota Readiness Banner */}
              <div className="bg-[#EEF1F6] border border-[#CBD5E1] rounded-[6px] p-4 space-y-3 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 border-b border-[#CBD5E1] pb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xl">🎲</span>
                    <div>
                      <strong className="text-[#16233F] text-sm block font-bold">
                        Assignment Quotas: {l2PoolStats?.quotas?.easy || 3} Easy + {l2PoolStats?.quotas?.medium || 3} Medium + {l2PoolStats?.quotas?.hard || 2} Hard = {l2PoolStats?.quotas?.total || 8} Questions per Candidate
                      </strong>
                      <p className="text-[#475569] text-xs mt-0.5">
                        Sampled randomly without replacement across difficulty buckets and shuffled per candidate.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Year 2 Pool Card */}
                  <div className="bg-white p-3 rounded border border-[#DBD7C9] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-[#16233F]">🎓 Academic Year 2 Pool</span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold uppercase ${
                        l2PoolStats?.is_ready_year_2
                          ? 'bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF]'
                          : 'bg-[#FDEDEC] text-[#C0392B] border border-[#F5B7B1]'
                      }`}>
                        {l2PoolStats?.is_ready_year_2 ? '🟢 Pool Ready' : '🔴 Quota Unmet'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 font-mono text-xs">
                      <span className="px-2 py-0.5 bg-[#F6F6F2] border rounded text-[#16233F]">
                        Easy: {l2PoolStats?.year_2?.easy || 0} / {l2PoolStats?.quotas?.easy || 3}
                      </span>
                      <span className="px-2 py-0.5 bg-[#F6F6F2] border rounded text-[#16233F]">
                        Medium: {l2PoolStats?.year_2?.medium || 0} / {l2PoolStats?.quotas?.medium || 3}
                      </span>
                      <span className="px-2 py-0.5 bg-[#F6F6F2] border rounded text-[#16233F]">
                        Hard: {l2PoolStats?.year_2?.hard || 0} / {l2PoolStats?.quotas?.hard || 2}
                      </span>
                      <span className="font-bold text-[#59626F] text-[11px]">
                        Total: {l2PoolStats?.year_2?.total || 0}
                      </span>
                    </div>
                  </div>

                  {/* Year 3 Pool Card */}
                  <div className="bg-white p-3 rounded border border-[#DBD7C9] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-[#16233F]">🎓 Academic Year 3 Pool</span>
                      <span className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold uppercase ${
                        l2PoolStats?.is_ready_year_3
                          ? 'bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF]'
                          : 'bg-[#FDEDEC] text-[#C0392B] border border-[#F5B7B1]'
                      }`}>
                        {l2PoolStats?.is_ready_year_3 ? '🟢 Pool Ready' : '🔴 Quota Unmet'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 font-mono text-xs">
                      <span className="px-2 py-0.5 bg-[#F6F6F2] border rounded text-[#16233F]">
                        Easy: {l2PoolStats?.year_3?.easy || 0} / {l2PoolStats?.quotas?.easy || 3}
                      </span>
                      <span className="px-2 py-0.5 bg-[#F6F6F2] border rounded text-[#16233F]">
                        Medium: {l2PoolStats?.year_3?.medium || 0} / {l2PoolStats?.quotas?.medium || 3}
                      </span>
                      <span className="px-2 py-0.5 bg-[#F6F6F2] border rounded text-[#16233F]">
                        Hard: {l2PoolStats?.year_3?.hard || 0} / {l2PoolStats?.quotas?.hard || 2}
                      </span>
                      <span className="font-bold text-[#59626F] text-[11px]">
                        Total: {l2PoolStats?.year_3?.total || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Question Bank Import Card */}
              <div className="bg-white border border-[#DBD7C9] p-5 rounded-[6px] space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DBD7C9] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#16233F] flex items-center gap-2">
                      <span>📤</span>
                      <span>Import Level 2 Questions</span>
                    </h3>
                    <p className="text-xs text-[#59626F] mt-0.5">
                      Upload a CSV/TSV file or paste rows copied directly from Excel / Google Sheets.
                    </p>
                  </div>
                  {/* Mode switcher */}
                  <div className="flex items-center bg-[#EEF1F6] p-0.5 rounded-[4px] border border-[#CBD5E1] self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setL2UploadMode('file')}
                      className={`px-3 py-1 text-xs font-semibold rounded-[3px] transition-colors ${
                        l2UploadMode === 'file'
                          ? 'bg-white text-[#16233F] shadow-sm'
                          : 'text-[#59626F] hover:text-[#16233F]'
                      }`}
                    >
                      📁 Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setL2UploadMode('paste')}
                      className={`px-3 py-1 text-xs font-semibold rounded-[3px] transition-colors ${
                        l2UploadMode === 'paste'
                          ? 'bg-white text-[#16233F] shadow-sm'
                          : 'text-[#59626F] hover:text-[#16233F]'
                      }`}
                    >
                      📋 Paste Rows
                    </button>
                  </div>
                </div>

                {/* Overwrite & formatting info */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-[#F8F9FA] p-3 rounded border border-[#E2E8F0] text-xs">
                  <div className="text-[11px] text-[#59626F] flex-1 leading-relaxed">
                    <span className="font-semibold text-[#16233F]">Expected Columns:</span>{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">question_id</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">academic_year (2 or 3)</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">difficulty (easy/med/hard)</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">language</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">question</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">code</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">option_a..d</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">correct_answer (a/b/c/d)</code>,{' '}
                    <code className="bg-[#EEF1F6] text-[#16233F] px-1 py-0.5 rounded">marks</code>
                  </div>
                  <label className="flex items-center space-x-2 shrink-0 cursor-pointer select-none bg-white px-2.5 py-1 border border-[#CBD5E1] rounded">
                    <input
                      type="checkbox"
                      checked={l2Overwrite}
                      onChange={(e) => setL2Overwrite(e.target.checked)}
                      className="rounded text-[#16233F]"
                    />
                    <span className="text-[11.5px] font-medium text-[#16233F]">Overwrite existing IDs</span>
                  </label>
                </div>

                {/* Mode 1: File Upload with Drag & Drop */}
                {l2UploadMode === 'file' ? (
                  <form onSubmit={handlePreviewL2Upload} className="space-y-3">
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsL2Dragging(true); }}
                      onDragLeave={() => setIsL2Dragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsL2Dragging(false);
                        if (e.dataTransfer.files?.[0]) {
                          setL2ImportFile(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => document.getElementById('l2-file-input')?.click()}
                      className={`border-2 border-dashed rounded-[6px] p-6 text-center cursor-pointer transition-colors ${
                        isL2Dragging
                          ? 'border-[#16233F] bg-[#EEF1F6]'
                          : l2ImportFile
                          ? 'border-[#A9DFBF] bg-[#E8F3EC]'
                          : 'border-[#CBD5E1] bg-[#FAFAFA] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      <input
                        id="l2-file-input"
                        type="file"
                        accept=".csv,.tsv,.txt"
                        onChange={(e) => setL2ImportFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      {l2ImportFile ? (
                        <div className="flex flex-col items-center space-y-1">
                          <span className="text-2xl">📄</span>
                          <span className="font-bold text-xs text-[#1E7A46]">
                            {l2ImportFile.name}
                          </span>
                          <span className="text-[11px] text-[#59626F]">
                            {(l2ImportFile.size / 1024).toFixed(1)} KB — Click or drag another file to replace
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center space-y-1">
                          <span className="text-2xl">📥</span>
                          <span className="font-semibold text-xs text-[#16233F]">
                            Drag &amp; drop your CSV or TSV file here, or click to browse
                          </span>
                          <span className="text-[11px] text-[#8B93A0]">
                            Supports .csv and .tsv files (UTF-8 encoded)
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      {l2ImportFile ? (
                        <button
                          type="button"
                          onClick={() => setL2ImportFile(null)}
                          className="text-xs text-[#C0392B] hover:underline"
                        >
                          ✕ Remove file
                        </button>
                      ) : <span />}
                      <button
                        type="submit"
                        disabled={!l2ImportFile || loading}
                        className="px-5 py-2 bg-[#16233F] text-white text-xs font-semibold rounded disabled:opacity-50 hover:bg-[#25355B] transition-colors"
                      >
                        {loading ? 'Analyzing...' : 'Preview & Validate File'}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Mode 2: Paste Raw Spreadsheet Rows */
                  <form onSubmit={handlePreviewL2Upload} className="space-y-3">
                    <div className="space-y-1">
                      <textarea
                        rows={7}
                        value={l2PasteText}
                        onChange={(e) => setL2PasteText(e.target.value)}
                        placeholder={`Paste tab-separated rows copied directly from Excel/Google Sheets, or comma-separated CSV lines:\n\nquestion_id\tacademic_year\tlanguage\tdifficulty\tquestion\tcode\toption_a\toption_b\toption_c\toption_d\tcorrect_answer\tmarks\nL2_Y2_001\t2\tpython\teasy\tMissing loop?\tdef f():\\n  pass\topt A\topt B\topt C\topt D\ta\t1`}
                        className="w-full p-3 font-mono text-xs border border-[#CBD5E1] rounded-[4px] bg-[#FAFAFA] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#16233F]"
                      />
                      <div className="flex justify-between items-center text-[11px] text-[#59626F]">
                        <span>
                          {l2PasteText.trim() ? `${l2PasteText.trim().split('\n').length} lines entered` : 'Select cells in your spreadsheet, press Ctrl+C, then paste directly here.'}
                        </span>
                        {l2PasteText && (
                          <button
                            type="button"
                            onClick={() => setL2PasteText('')}
                            className="text-[#C0392B] hover:underline"
                          >
                            Clear input
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!l2PasteText.trim() || loading}
                        className="px-5 py-2 bg-[#16233F] text-white text-xs font-semibold rounded disabled:opacity-50 hover:bg-[#25355B] transition-colors"
                      >
                        {loading ? 'Analyzing...' : 'Preview & Validate Pasted Rows'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Filter & Search Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 border border-[#DBD7C9] rounded-[4px]">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-[#59626F]">Filter Year:</span>
                  <select
                    value={l2YearFilter}
                    onChange={(e) => setL2YearFilter(e.target.value ? Number(e.target.value) : '')}
                    className="border border-[#C6C1B0] p-1 rounded text-xs bg-white"
                  >
                    <option value="">All Eligible (Years 2 &amp; 3)</option>
                    <option value={2}>Year 2 Only</option>
                    <option value={3}>Year 3 Only</option>
                  </select>

                  <span className="text-xs font-semibold text-[#59626F] ml-2">Difficulty:</span>
                  <select
                    value={l2DiffFilter}
                    onChange={(e) => setL2DiffFilter(e.target.value)}
                    className="border border-[#C6C1B0] p-1 rounded text-xs bg-white"
                  >
                    <option value="">All Difficulties</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    placeholder="Search by ID, prompt, or code..."
                    value={l2Search}
                    onChange={(e) => setL2Search(e.target.value)}
                    className="border border-[#C6C1B0] p-1.5 rounded text-xs w-64"
                  />
                  {l2Search && (
                    <button
                      onClick={() => setL2Search('')}
                      className="text-xs text-[#59626F] px-1"
                    >
                      ✕
                    </button>
                  )}
                  <span className="text-xs font-mono text-[#8B93A0] ml-2">
                    {problems.length} Questions
                  </span>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                {problems.map((q) => (
                  <div key={q.id} className="bg-white border border-[#DBD7C9] rounded-[6px] p-5 text-xs space-y-3.5 shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#DBD7C9] pb-3">
                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono font-bold text-xs text-[#16233F] bg-[#EEF1F6] px-2 py-0.5 rounded-[3px]">
                          {q.question_id}
                        </span>
                        <span className="px-2 py-0.5 bg-[#F6F6F2] text-[#16233F] border border-[#DBD7C9] font-mono rounded text-[10.5px] font-bold">
                          Year {q.academic_year}
                        </span>
                        <span className={`px-2 py-0.5 font-mono rounded text-[10.5px] font-bold uppercase ${
                          q.difficulty.toLowerCase() === 'easy'
                            ? 'bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF]'
                            : q.difficulty.toLowerCase() === 'hard'
                            ? 'bg-[#FDEDEC] text-[#C0392B] border border-[#F5B7B1]'
                            : 'bg-[#FEF9E7] text-[#B7950B] border border-[#F9E79F]'
                        }`}>
                          {q.difficulty} · {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
                        </span>
                        <span className="meta-chip uppercase text-[10px]">
                          {q.language || 'Python'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            setEditProbForm({ ...q });
                            setShowEditProbModal(true);
                          }}
                          className="px-2.5 py-1 bg-[#EEF1F6] text-[#16233F] border border-[#C6C1B0] hover:bg-[#DBD7C9] rounded-[3px] transition-colors font-medium text-xs flex items-center space-x-1"
                        >
                          <span>✏️ Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteL2Question(q.id, q.question_id)}
                          className="px-2.5 py-1 text-[#A82A2A] hover:bg-[#FDEDEC] rounded-[3px] transition-colors font-medium text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Question Prompt */}
                    <div className="text-[#1B2029] text-[13px] font-medium leading-relaxed">
                      {q.question}
                    </div>

                    {/* Code Snippet with highlighted missing line */}
                    <div className="bg-[#161B22] text-[#E6EDF3] rounded-[4px] border border-[#30363D] overflow-x-auto p-3 font-mono text-[11px] leading-relaxed max-h-56">
                      {q.code.split('\n').map((line: string, lineIdx: number) => {
                        const isMissing =
                          line.includes('// [ MISSING LINE HERE ]') ||
                          line.includes('MISSING LINE') ||
                          line.includes('__MISSING_LINE__') ||
                          line.includes('???');
                        return isMissing ? (
                          <div
                            key={lineIdx}
                            className="my-1 px-2.5 py-1 rounded border border-dashed border-[#F59E0B] bg-[#F59E0B]/20 text-[#FBBF24] font-mono text-[11px] font-bold flex items-center space-x-2"
                          >
                            <span>👉</span>
                            <span>[ MISSING LINE HERE ]</span>
                          </div>
                        ) : (
                          <div key={lineIdx} className="flex hover:bg-[#21262D]/50 px-1 rounded">
                            <span className="select-none text-[#484F58] w-6 shrink-0 text-right pr-2 font-mono text-[10px]">
                              {lineIdx + 1}
                            </span>
                            <span className="whitespace-pre font-mono text-[#C9D1D9]">{line}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* 4 Options Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-mono text-xs">
                      {(['a', 'b', 'c', 'd'] as const).map((opt) => {
                        const isCorrect = q.correct_answer.toLowerCase() === opt;
                        const optText = q[`option_${opt}`];

                        return (
                          <div
                            key={opt}
                            className={`p-2.5 rounded-[4px] border flex items-center space-x-2.5 ${
                              isCorrect
                                ? 'bg-[#E8F3EC] border-[#1E7A46] text-[#1E7A46] font-bold'
                                : 'bg-[#F6F6F2] border-[#DBD7C9] text-[#1B2029]'
                            }`}
                          >
                            <span className="font-bold uppercase text-[11px] w-5">
                              {opt.toUpperCase()}.
                            </span>
                            <span className="break-all">{optText}</span>
                            {isCorrect && (
                              <span className="ml-auto text-[10.5px] px-1.5 py-0.2 bg-[#1E7A46] text-white rounded font-bold">
                                ✓ Correct
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {problems.length === 0 && (
                  <div className="p-8 bg-white border border-[#DBD7C9] rounded text-center text-[#59626F] text-xs">
                    No questions match the selected filters. Use "+ Add Question" or "Bulk CSV Question Import" above.
                  </div>
                )}
              </div>

              {/* Question Preview Modal */}
              {showL2PreviewModal && l2PreviewData && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-6 max-w-3xl w-full text-xs space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                    <div className="border-b border-[#DBD7C9] pb-3 flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-bold text-[#16233F]">Question Import Pre-flight Validation</h3>
                        <p className="text-[11px] text-[#59626F] mt-0.5">
                          Row-by-row validation of academic year, question IDs, syntax, and required fields.
                        </p>
                      </div>
                      <div className="flex items-center space-x-2 font-mono">
                        <span className="px-2.5 py-1 bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF] rounded font-bold">
                          {l2PreviewData.valid_rows_count} Valid
                        </span>
                        <span className="px-2.5 py-1 bg-[#FDEDEC] text-[#C0392B] border border-[#F5B7B1] rounded font-bold">
                          {l2PreviewData.invalid_rows_count} Errors
                        </span>
                      </div>
                    </div>

                    {/* Errors List */}
                    {l2PreviewData.invalid_rows_count > 0 && (
                      <div className="bg-[#FDEDEC] border border-[#F5B7B1] rounded p-3 text-xs space-y-2">
                        <strong className="text-[#C0392B] block">
                          Validation Errors ({l2PreviewData.errors?.length} Issues Found):
                        </strong>
                        <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[11px] text-[#A82A2A]">
                          {l2PreviewData.errors?.map((err: any, idx: number) => (
                            <div key={idx} className="flex items-start space-x-2">
                              <span className="font-bold shrink-0">Row {err.row_number} ({err.question_id}):</span>
                              <span>{err.error}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Preview Table */}
                    <div>
                      <h4 className="font-bold text-[#16233F] mb-2 uppercase text-[11px] font-mono">
                        Preview Valid Rows (First {l2PreviewData.preview?.length || 0})
                      </h4>
                      <div className="border border-[#DBD7C9] rounded overflow-x-auto max-h-60">
                        <table className="w-full text-left font-mono text-[11px]">
                          <thead className="bg-[#EEF1F6] text-[#16233F] border-b border-[#DBD7C9]">
                            <tr>
                              <th className="p-2">ID</th>
                              <th className="p-2">Year</th>
                              <th className="p-2">Diff</th>
                              <th className="p-2">Lang</th>
                              <th className="p-2">Question</th>
                              <th className="p-2">Ans</th>
                              <th className="p-2">Marks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#DBD7C9]">
                            {l2PreviewData.preview?.map((r: any, idx: number) => (
                              <tr key={idx} className="hover:bg-[#F6F6F2]">
                                <td className="p-2 font-bold text-[#16233F]">{r.question_id}</td>
                                <td className="p-2">Yr {r.academic_year}</td>
                                <td className="p-2 uppercase">{r.difficulty}</td>
                                <td className="p-2">{r.language}</td>
                                <td className="p-2 font-sans truncate max-w-xs">{r.question}</td>
                                <td className="p-2 uppercase font-bold text-[#1E7A46]">{r.correct_answer}</td>
                                <td className="p-2">{r.marks}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex justify-end space-x-2 pt-3 border-t border-[#DBD7C9]">
                      <button
                        type="button"
                        onClick={() => setShowL2PreviewModal(false)}
                        className="px-4 py-1.5 border border-[#C6C1B0] rounded text-xs hover:bg-[#F6F6F2]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={l2PreviewData.valid_rows_count === 0 || loading}
                        onClick={handleCommitL2Import}
                        className="px-4 py-1.5 bg-[#1E7E34] text-white rounded text-xs font-semibold hover:bg-[#166027] disabled:opacity-50"
                      >
                        {loading ? 'Importing…' : `Import ${l2PreviewData.valid_rows_count} Valid Questions`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Configure Quotas Modal */}
              {showL2QuotaModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-6 max-w-md w-full text-xs space-y-4 shadow-xl">
                    <div className="border-b border-[#DBD7C9] pb-2">
                      <h3 className="text-sm font-bold text-[#16233F]">Configure Assessment Quotas</h3>
                      <p className="text-[11px] text-[#59626F]">
                        Set how many questions from each difficulty pool are sampled per student attempt.
                      </p>
                    </div>

                    <form onSubmit={handleUpdateQuotas} className="space-y-3 font-mono">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-[#59626F] mb-1">
                          Easy Questions Quota
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={quotaForm.quota_easy}
                          onChange={(e) => setQuotaForm({ ...quotaForm, quota_easy: Number(e.target.value) })}
                          className="w-full border border-[#C6C1B0] p-1.5 rounded"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-[#59626F] mb-1">
                          Medium Questions Quota
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={quotaForm.quota_medium}
                          onChange={(e) => setQuotaForm({ ...quotaForm, quota_medium: Number(e.target.value) })}
                          className="w-full border border-[#C6C1B0] p-1.5 rounded"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-[#59626F] mb-1">
                          Hard Questions Quota
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={quotaForm.quota_hard}
                          onChange={(e) => setQuotaForm({ ...quotaForm, quota_hard: Number(e.target.value) })}
                          className="w-full border border-[#C6C1B0] p-1.5 rounded"
                          required
                        />
                      </div>

                      <div className="p-2.5 bg-[#EEF1F6] rounded text-[#16233F] text-[11px]">
                        Total per Attempt: <strong>{Number(quotaForm.quota_easy) + Number(quotaForm.quota_medium) + Number(quotaForm.quota_hard)} questions</strong>
                      </div>

                      <div className="flex justify-end space-x-2 pt-2 border-t border-[#DBD7C9]">
                        <button
                          type="button"
                          onClick={() => setShowL2QuotaModal(false)}
                          className="px-3.5 py-1.5 border border-[#C6C1B0] rounded text-xs hover:bg-[#F6F6F2]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B]"
                        >
                          Save Quotas
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Add Single Question Modal */}
              {showAddProbModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-6 max-w-2xl w-full text-xs space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
                    <div className="border-b border-[#DBD7C9] pb-2">
                      <h3 className="text-sm font-bold text-[#16233F]">Create Level 2 Debugging Question</h3>
                      <p className="text-[11px] text-[#59626F]">
                        Add a new missing-line question with code snippet and 4 selectable options.
                      </p>
                    </div>

                    <form onSubmit={handleAddL2Question} className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Question ID</label>
                          <input
                            value={newL2Question.question_id}
                            onChange={(e) => setNewL2Question({ ...newL2Question, question_id: e.target.value })}
                            placeholder="e.g. L2_Y2_001"
                            className="w-full border border-[#C6C1B0] p-1.5 rounded font-mono"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Academic Year</label>
                          <select
                            value={newL2Question.academic_year}
                            onChange={(e) => setNewL2Question({ ...newL2Question, academic_year: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded bg-white font-semibold"
                          >
                            <option value={2}>Year 2</option>
                            <option value={3}>Year 3</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Difficulty</label>
                          <select
                            value={newL2Question.difficulty}
                            onChange={(e) => setNewL2Question({ ...newL2Question, difficulty: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded bg-white"
                          >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Language</label>
                          <input
                            value={newL2Question.language}
                            onChange={(e) => setNewL2Question({ ...newL2Question, language: e.target.value })}
                            placeholder="e.g. python, c, cpp, java"
                            className="w-full border border-[#C6C1B0] p-1.5 rounded font-mono"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Marks</label>
                          <input
                            type="number"
                            min={1}
                            value={newL2Question.marks}
                            onChange={(e) => setNewL2Question({ ...newL2Question, marks: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded font-mono"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Question Prompt</label>
                        <textarea
                          rows={2}
                          value={newL2Question.question}
                          onChange={(e) => setNewL2Question({ ...newL2Question, question: e.target.value })}
                          placeholder="State the objective or bug to identify..."
                          className="w-full border border-[#C6C1B0] p-2 rounded text-xs"
                          required
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase">
                            Code Snippet (Include <code>// [ MISSING LINE HERE ]</code>)
                          </label>
                        </div>
                        <textarea
                          rows={5}
                          value={newL2Question.code}
                          onChange={(e) => setNewL2Question({ ...newL2Question, code: e.target.value })}
                          placeholder={"def calculate(arr):\n    ans = 0\n    for x in arr:\n        // [ MISSING LINE HERE ]\n    return ans"}
                          className="w-full border border-[#C6C1B0] p-2 rounded font-mono text-xs bg-[#161B22] text-[#C9D1D9]"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option A</label>
                          <input
                            value={newL2Question.option_a}
                            onChange={(e) => setNewL2Question({ ...newL2Question, option_a: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option B</label>
                          <input
                            value={newL2Question.option_b}
                            onChange={(e) => setNewL2Question({ ...newL2Question, option_b: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option C</label>
                          <input
                            value={newL2Question.option_c}
                            onChange={(e) => setNewL2Question({ ...newL2Question, option_c: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option D</label>
                          <input
                            value={newL2Question.option_d}
                            onChange={(e) => setNewL2Question({ ...newL2Question, option_d: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">
                          Correct Option (Award marks if participant selects this)
                        </label>
                        <select
                          value={newL2Question.correct_answer}
                          onChange={(e) => setNewL2Question({ ...newL2Question, correct_answer: e.target.value })}
                          className="w-full border border-[#C6C1B0] p-1.5 rounded font-bold bg-[#E8F3EC] text-[#1E7A46]"
                        >
                          <option value="a">A</option>
                          <option value="b">B</option>
                          <option value="c">C</option>
                          <option value="d">D</option>
                        </select>
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
                          disabled={loading}
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B]"
                        >
                          {loading ? 'Saving…' : 'Save Question'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit Question Modal */}
              {showEditProbModal && editProbForm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-6 max-w-2xl w-full text-xs space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
                    <div className="border-b border-[#DBD7C9] pb-2">
                      <h3 className="text-sm font-bold text-[#16233F]">Edit Question: {editProbForm.question_id}</h3>
                    </div>

                    <form onSubmit={handleUpdateL2Question} className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Academic Year</label>
                          <select
                            value={editProbForm.academic_year}
                            onChange={(e) => setEditProbForm({ ...editProbForm, academic_year: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded bg-white"
                          >
                            <option value={2}>Year 2</option>
                            <option value={3}>Year 3</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Difficulty</label>
                          <select
                            value={editProbForm.difficulty}
                            onChange={(e) => setEditProbForm({ ...editProbForm, difficulty: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded bg-white"
                          >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Marks</label>
                          <input
                            type="number"
                            min={1}
                            value={editProbForm.marks}
                            onChange={(e) => setEditProbForm({ ...editProbForm, marks: Number(e.target.value) })}
                            className="w-full border border-[#C6C1B0] p-1.5 rounded font-mono"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Question Prompt</label>
                        <textarea
                          rows={2}
                          value={editProbForm.question}
                          onChange={(e) => setEditProbForm({ ...editProbForm, question: e.target.value })}
                          className="w-full border border-[#C6C1B0] p-2 rounded text-xs"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Code Snippet</label>
                        <textarea
                          rows={5}
                          value={editProbForm.code}
                          onChange={(e) => setEditProbForm({ ...editProbForm, code: e.target.value })}
                          className="w-full border border-[#C6C1B0] p-2 rounded font-mono text-xs bg-[#161B22] text-[#C9D1D9]"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option A</label>
                          <input
                            value={editProbForm.option_a}
                            onChange={(e) => setEditProbForm({ ...editProbForm, option_a: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option B</label>
                          <input
                            value={editProbForm.option_b}
                            onChange={(e) => setEditProbForm({ ...editProbForm, option_b: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option C</label>
                          <input
                            value={editProbForm.option_c}
                            onChange={(e) => setEditProbForm({ ...editProbForm, option_c: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold">Option D</label>
                          <input
                            value={editProbForm.option_d}
                            onChange={(e) => setEditProbForm({ ...editProbForm, option_d: e.target.value })}
                            className="w-full border border-[#C6C1B0] p-1 rounded font-mono text-xs"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">
                          Correct Option
                        </label>
                        <select
                          value={editProbForm.correct_answer.toLowerCase()}
                          onChange={(e) => setEditProbForm({ ...editProbForm, correct_answer: e.target.value })}
                          className="w-full border border-[#C6C1B0] p-1.5 rounded font-bold bg-[#E8F3EC] text-[#1E7A46]"
                        >
                          <option value="a">A</option>
                          <option value="b">B</option>
                          <option value="c">C</option>
                          <option value="d">D</option>
                        </select>
                      </div>

                      <div className="flex justify-end space-x-2 pt-3 border-t border-[#DBD7C9]">
                        <button
                          type="button"
                          onClick={() => { setShowEditProbModal(false); setEditProbForm(null); }}
                          className="px-3.5 py-1.5 border border-[#C6C1B0] rounded text-xs hover:bg-[#F6F6F2]"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B]"
                        >
                          {loading ? 'Saving…' : 'Save Changes'}
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
                      `leaderboard_${lbFilter.toLowerCase()}${lbYearFilter ? `_y${lbYearFilter}` : ''}${lbTopLimit ? `_top${lbTopLimit}` : ''}.csv`,
                      ['Rank','Roll Number','Name','Year','MCQ Score (/25)','Qualified L2','Coding Score (/60)','Presentation (/50)','Total Score','Violations'],
                      ['rank','roll_number','name','academic_year','mcq_score','mcq_qualified','coding_score','presentation_score','total_score','violations']
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

                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Top Rank:</span>
                  <select
                    value={lbTopLimit}
                    onChange={(e) => setLbTopLimit(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Records</option>
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                    <option value="100">Top 100</option>
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
                      <th className="py-2.5 px-3 text-center">Presentation (/50)</th>
                      <th className="py-2.5 px-3 text-center font-bold">Total Score</th>
                      <th className="py-2.5 px-3 text-center">Violations</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
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
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-[#16233F]">
                          {e.presentation_score !== null ? `${e.presentation_score}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1E7E34]">
                          {e.total_score}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span className={e.violations > 0 ? 'text-[#A82A2A] font-bold' : 'text-[#8B93A0]'}>
                            {e.violations}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedParticipantForEmergency({
                              id: e.participant_id,
                              participant_id: e.participant_id,
                              roll_number: e.roll_number,
                              name: e.name,
                              academic_year: e.academic_year,
                              mcq_qualified: e.mcq_qualified,
                              email: `${e.roll_number}@codefest`
                            })}
                            className="px-2 py-1 bg-[#16233F] text-white rounded text-[10.5px] font-semibold hover:bg-[#25355B] inline-flex items-center space-x-1"
                            title="Emergency Reset or Reassign L1 / L2"
                          >
                            <span>⚙️</span>
                            <span>Fix / Reset</span>
                          </button>
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
                      `round1_mcq_results_${r1Filter.toLowerCase()}${r1YearFilter ? `_y${r1YearFilter}` : ''}${r1TopLimit ? `_top${r1TopLimit}` : ''}.csv`,
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

                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Top Rank:</span>
                  <select
                    value={r1TopLimit}
                    onChange={(e) => setR1TopLimit(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Records</option>
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                    <option value="100">Top 100</option>
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
                      <th className="py-2.5 px-3 text-center">Round 2 Entry</th>
                      <th className="py-2.5 px-3 text-center">Violations</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
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
                          <button
                            onClick={() => handleQuickToggleQualify(e.participant_id, e.roll_number, e.name, e.mcq_qualified)}
                            className={`px-2.5 py-1 rounded-[3px] text-[10.5px] font-bold border transition-all cursor-pointer shadow-xs ${
                              e.mcq_qualified
                                ? 'bg-[#E8F3EC] text-[#1E7E34] border-[#1E7E34]/40 hover:bg-[#FDEDEC] hover:text-[#A82A2A] hover:border-[#A82A2A]/40'
                                : 'bg-[#FDEDEC] text-[#A82A2A] border-[#A82A2A]/40 hover:bg-[#E8F3EC] hover:text-[#1E7E34] hover:border-[#1E7E34]/40'
                            }`}
                            title={`Click to ${e.mcq_qualified ? 'DISQUALIFY' : 'QUALIFY'} for Level 2`}
                          >
                            {e.mcq_qualified ? '✓ QUALIFIED' : '+ QUALIFY FOR R2'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span className={e.violations > 0 ? 'text-[#A82A2A] font-bold' : 'text-[#8B93A0]'}>{e.violations}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedParticipantForEmergency({
                              id: e.participant_id,
                              participant_id: e.participant_id,
                              roll_number: e.roll_number,
                              name: e.name,
                              academic_year: e.academic_year,
                              mcq_qualified: e.mcq_qualified,
                              email: `${e.roll_number}@codefest`
                            })}
                            className="px-2 py-1 bg-[#16233F] text-white rounded text-[10.5px] font-semibold hover:bg-[#25355B] inline-flex items-center space-x-1"
                            title="Emergency Reset or Reassign L1 / L2"
                          >
                            <span>⚙️</span>
                            <span>Fix / Reset</span>
                          </button>
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
                  <h2 className="text-lg font-bold text-[#16233F]">🏆 Round 2 — Debugging Results</h2>
                  <p className="text-xs text-[#59626F]">Ranked by Total Score (MCQ + Debugging). Gold = top 3 finalists.</p>
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
                      `round2_debugging_results${r2YearFilter ? `_y${r2YearFilter}` : ''}${r2TopLimit ? `_top${r2TopLimit}` : ''}.csv`,
                      ['Rank','Roll Number','Name','Year','MCQ Score (/25)','Debugging Score (/60)','Total Score','Violations'],
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

                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Top Rank:</span>
                  <select
                    value={r2TopLimit}
                    onChange={(e) => setR2TopLimit(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Records</option>
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                    <option value="100">Top 100</option>
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
                        {w?.coding_score ?? 0}<span className="text-sm text-[#8B93A0]"> / 60 pts (Debug)</span>
                      </div>
                      <div className="text-[10px] text-[#59626F] mt-0.5">MCQ: {w?.mcq_score}/25 · Total: {w?.total_score}</div>
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
                      <th className="py-2.5 px-3 text-center">MCQ (/25)</th>
                      <th className="py-2.5 px-3 text-center">Debugging (/60)</th>
                      <th className="py-2.5 px-3 text-center font-bold">Total</th>
                      <th className="py-2.5 px-3 text-center">Violations</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
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
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => setSelectedParticipantForEmergency({
                              id: e.participant_id,
                              participant_id: e.participant_id,
                              roll_number: e.roll_number,
                              name: e.name,
                              academic_year: e.academic_year,
                              mcq_qualified: e.mcq_qualified,
                              email: `${e.roll_number}@codefest`
                            })}
                            className="px-2 py-1 bg-[#16233F] text-white rounded text-[10.5px] font-semibold hover:bg-[#25355B] inline-flex items-center space-x-1"
                            title="Emergency Reset or Reassign L1 / L2"
                          >
                            <span>⚙️</span>
                            <span>Fix / Reset</span>
                          </button>
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

          {/* TAB 9: LEVEL 3 EVALUATION (PRESENTATION & VIVA) */}
          {activeTab === 'presentation' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F]">🎤 Level 3 — Presentation &amp; Viva Evaluation</h2>
                  <p className="text-xs text-[#59626F]">Faculty manual grading interface. Assign marks out of 50 (Presentation 15, Technical 20, Viva 15).</p>
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
                    onClick={() => setShowPromoteModal(true)}
                    className="px-3 py-1.5 bg-[#8A5A00] text-white text-xs font-bold rounded-[3px] hover:bg-[#6D4700] transition-colors flex items-center space-x-1"
                  >
                    <span>⚡ Promote Finalists</span>
                  </button>
                  <button
                    onClick={() => downloadCSV(
                      filteredFinalists.map((f, idx) => ({
                        rank: idx + 1,
                        roll_number: f.roll_number,
                        name: f.name,
                        email: f.email,
                        academic_year: f.academic_year,
                        mcq_score: f.mcq_score ?? 'N/A',
                        coding_score: f.coding_score ?? 'N/A',
                        total_previous_score: f.total_previous_score,
                        presentation_score: f.evaluation?.presentation_score ?? 'N/A',
                        technical_score: f.evaluation?.technical_score ?? 'N/A',
                        viva_score: f.evaluation?.viva_score ?? 'N/A',
                        level3_total: f.evaluation?.total_score ?? 'N/A',
                        grand_total_score: f.grand_total_score,
                        status: f.status,
                        evaluator: f.evaluation?.evaluator_name ?? 'N/A',
                        remarks: f.evaluation?.remarks ?? ''
                      })),
                      `level3_presentation_evaluations${presTopLimit ? `_top${presTopLimit}` : ''}.csv`,
                      ['Rank','Roll Number','Name','Email','Year','MCQ (/25)','Coding (/60)','Prev Total (/85)','Presentation (/15)','Technical (/20)','Viva (/15)','Level 3 Total (/50)','Grand Total (/135)','Status','Evaluator','Remarks'],
                      ['rank','roll_number','name','email','academic_year','mcq_score','coding_score','total_previous_score','presentation_score','technical_score','viva_score','level3_total','grand_total_score','status','evaluator','remarks']
                    )}
                    className="px-4 py-2 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] transition-colors flex items-center space-x-1.5"
                  >
                    <span>⬇ Download Level 3 CSV ({filteredFinalists.length})</span>
                  </button>
                </div>
              </div>

              {/* Filter Controls Strip */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-[4px] border border-[#DBD7C9]">
                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Evaluation:</span>
                  <select
                    value={presFilter}
                    onChange={(e) => setPresFilter(e.target.value as any)}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="ALL">All Finalists ({finalists.length})</option>
                    <option value="EVALUATED">✓ Evaluated ({finalists.filter(f => f.status === 'EVALUATED').length})</option>
                    <option value="PENDING">⏳ Pending Evaluation ({finalists.filter(f => f.status === 'PENDING').length})</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Academic Year:</span>
                  <select
                    value={presYearFilter}
                    onChange={(e) => setPresYearFilter(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Years (1–4)</option>
                    <option value="1">Year 1</option>
                    <option value="2">Year 2</option>
                    <option value="3">Year 3</option>
                    <option value="4">Year 4</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="font-semibold text-[#59626F]">Top Rank:</span>
                  <select
                    value={presTopLimit}
                    onChange={(e) => setPresTopLimit(e.target.value ? Number(e.target.value) : '')}
                    className="h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium text-[#16233F]"
                  >
                    <option value="">All Records</option>
                    <option value="10">Top 10</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                    <option value="100">Top 100</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={presSearch}
                    onChange={(e) => setPresSearch(e.target.value)}
                    placeholder="Search finalist by Roll Number or Name…"
                    className="h-8 px-3 text-xs border border-[#C6C1B0] rounded-[3px] w-full"
                  />
                </div>

                <div className="text-xs text-[#8B93A0] font-mono">
                  Showing <strong>{filteredFinalists.length}</strong> of {finalists.length} finalists
                </div>
              </div>

              {/* Top 3 Finalists Podium (if available) */}
              {filteredFinalists.filter(f => f.status === 'EVALUATED').length >= 3 && (
                <div className="grid grid-cols-3 gap-3">
                  {[filteredFinalists[1], filteredFinalists[0], filteredFinalists[2]].map((w, i) => (
                    <div key={w?.participant_id} className={`rounded-[6px] p-4 border-2 text-center ${
                      i === 1 ? 'border-[#E3B341] bg-[#FFFBEB]' : i === 0 ? 'border-[#8B93A0] bg-[#F6F6F2]' : 'border-[#CD7F32] bg-[#FFF5EE]'
                    }`}>
                      <div className="text-3xl mb-1">{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
                      <div className="font-bold text-[#16233F] text-sm">{w?.name}</div>
                      <div className="text-[11px] text-[#59626F] font-mono">{w?.roll_number}</div>
                      <div className="text-xl font-bold font-mono text-[#1E7A46] mt-2">
                        {w?.grand_total_score}<span className="text-xs text-[#8B93A0]"> / 135 pts</span>
                      </div>
                      <div className="text-[10px] text-[#59626F] mt-0.5">
                        L3: {w?.evaluation?.total_score || 0}/50 · Prev: {w?.total_previous_score}/85
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Finalists Table */}
              <div className="bg-white border border-[#DBD7C9] rounded-[4px] overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F6F6F2] border-b border-[#DBD7C9] font-semibold text-[#16233F]">
                      <th className="py-2.5 px-3 text-center font-mono">#</th>
                      <th className="py-2.5 px-3 font-mono">Roll Number</th>
                      <th className="py-2.5 px-3">Candidate</th>
                      <th className="py-2.5 px-3 text-center">Year</th>
                      <th className="py-2.5 px-3 text-center">MCQ (/25)</th>
                      <th className="py-2.5 px-3 text-center">Code (/60)</th>
                      <th className="py-2.5 px-3 text-center">Pres. (/15)</th>
                      <th className="py-2.5 px-3 text-center">Tech. (/20)</th>
                      <th className="py-2.5 px-3 text-center">Viva (/15)</th>
                      <th className="py-2.5 px-3 text-center font-bold text-[#16233F]">L3 Total (/50)</th>
                      <th className="py-2.5 px-3 text-center font-bold text-[#1E7A46]">Grand Total (/135)</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DBD7C9]">
                    {filteredFinalists.map((f, idx) => (
                      <tr key={f.participant_id} className={`hover:bg-[#F6F6F2]/70 ${f.status === 'EVALUATED' ? 'bg-[#F0FBF4]/40' : ''}`}>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#16233F]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#16233F]">{f.roll_number}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#16233F]">{f.name}</div>
                          <div className="text-[11px] text-[#59626F] font-mono">{f.email}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center">{f.academic_year}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{f.mcq_score ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{f.coding_score ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{f.evaluation?.presentation_score ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{f.evaluation?.technical_score ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{f.evaluation?.viva_score ?? '—'}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#16233F]">
                          {f.evaluation ? `${f.evaluation.total_score} / 50` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1E7A46] text-sm">
                          {f.grand_total_score}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold ${
                            f.status === 'EVALUATED'
                              ? 'bg-[#E8F3EC] text-[#1E7A46]'
                              : 'bg-[#FFF3CD] text-[#8A5A00]'
                          }`}>
                            {f.status === 'EVALUATED' ? '✓ EVALUATED' : '⏳ PENDING'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFinalistForGrade(f);
                              setGradeForm({
                                presentation_score: f.evaluation?.presentation_score || 0,
                                technical_score: f.evaluation?.technical_score || 0,
                                viva_score: f.evaluation?.viva_score || 0,
                                remarks: f.evaluation?.remarks || '',
                              });
                            }}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-[3px] transition-colors border ${
                              f.status === 'EVALUATED'
                                ? 'bg-white border-[#DBD7C9] text-[#16233F] hover:bg-[#F6F6F2]'
                                : 'bg-[#16233F] border-[#16233F] text-white hover:bg-[#25355B]'
                            }`}
                          >
                            {f.status === 'EVALUATED' ? '✏ Edit Marks' : 'Assign Marks'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredFinalists.length === 0 && (
                  <p className="text-xs text-[#8B93A0] text-center py-8">
                    No Level 3 finalists found. You can promote finalists from Level 2 using the "Promote Finalists" button above.
                  </p>
                )}
              </div>
            </div>
          )}

      {/* FACULTY LEVEL 3 GRADING MODAL */}
      {selectedFinalistForGrade && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#DBD7C9] pb-3 flex items-start justify-between">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#1E7A46] font-bold">
                  Faculty Manual Evaluation · Level 03
                </div>
                <h3 className="font-serif text-[20px] font-bold text-[#1B2029] mt-0.5">
                  {selectedFinalistForGrade.name}
                </h3>
                <p className="text-xs text-[#59626F] font-mono mt-0.5">
                  Roll: {selectedFinalistForGrade.roll_number} · Year {selectedFinalistForGrade.academic_year} · L1: {selectedFinalistForGrade.mcq_score ?? 0}/25 · L2: {selectedFinalistForGrade.coding_score ?? 0}/60
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFinalistForGrade(null)}
                className="text-lg font-bold text-[#8B93A0] hover:text-[#1B2029]"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveEvaluation} className="space-y-4 text-xs">
              {/* Rubric Breakdown Grid */}
              <div className="space-y-3 bg-[#F6F6F2] p-4 rounded-[4px] border border-[#DBD7C9]">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#16233F]">1. Presentation &amp; Communication Skills (0 – 15):</label>
                    <span className="font-mono font-bold text-[#16233F]">{gradeForm.presentation_score} / 15</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    required
                    value={gradeForm.presentation_score}
                    onChange={(e) => setGradeForm({ ...gradeForm, presentation_score: Math.min(15, Math.max(0, Number(e.target.value) || 0)) })}
                    className="w-full h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-mono"
                  />
                  <p className="text-[10.5px] text-[#59626F] mt-0.5">Clarity of explanation, slide deck / demo flow, articulation.</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#16233F]">2. Technical Architecture &amp; Code Defense (0 – 20):</label>
                    <span className="font-mono font-bold text-[#16233F]">{gradeForm.technical_score} / 20</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    required
                    value={gradeForm.technical_score}
                    onChange={(e) => setGradeForm({ ...gradeForm, technical_score: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })}
                    className="w-full h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-mono"
                  />
                  <p className="text-[10.5px] text-[#59626F] mt-0.5">Algorithm explanation, time/space complexity analysis, code robustness.</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#16233F]">3. Viva Q&amp;A &amp; Conceptual Depth (0 – 15):</label>
                    <span className="font-mono font-bold text-[#16233F]">{gradeForm.viva_score} / 15</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="15"
                    required
                    value={gradeForm.viva_score}
                    onChange={(e) => setGradeForm({ ...gradeForm, viva_score: Math.min(15, Math.max(0, Number(e.target.value) || 0)) })}
                    className="w-full h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-mono"
                  />
                  <p className="text-[10.5px] text-[#59626F] mt-0.5">Response to impromptu faculty questions, CS fundamentals, problem-solving depth.</p>
                </div>

                {/* Total Live Calculator */}
                <div className="pt-2 border-t border-[#DBD7C9] flex items-center justify-between font-bold text-sm">
                  <span className="text-[#16233F]">Level 3 Awarded Total:</span>
                  <span className="font-mono text-[#1E7A46] text-base">
                    {Number(gradeForm.presentation_score || 0) + Number(gradeForm.technical_score || 0) + Number(gradeForm.viva_score || 0)} / 50 Marks
                  </span>
                </div>
              </div>

              {/* Remarks Area */}
              <div>
                <label className="block font-semibold text-[#16233F] mb-1">Faculty Remarks &amp; Feedback:</label>
                <textarea
                  rows={3}
                  value={gradeForm.remarks}
                  onChange={(e) => setGradeForm({ ...gradeForm, remarks: e.target.value })}
                  placeholder="E.g., Excellent defense of recursive time complexity; strong viva answers..."
                  className="w-full p-2 text-xs border border-[#C6C1B0] rounded-[3px] bg-white"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  disabled={isGradingSubmitting}
                  onClick={() => setSelectedFinalistForGrade(null)}
                  className="px-4 py-2 bg-white border border-[#DBD7C9] text-[#59626F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGradingSubmitting}
                  className="px-5 py-2 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] transition-colors flex items-center space-x-2"
                >
                  {isGradingSubmitting ? 'Saving Marks…' : 'Save Marks & Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROMOTE LEVEL 2 FINALISTS MODAL */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="border-b border-[#DBD7C9] pb-3 flex items-start justify-between">
              <div>
                <h3 className="font-serif text-[18px] font-bold text-[#16233F]">
                  Promote Finalists to Level 3
                </h3>
                <p className="text-xs text-[#59626F] mt-0.5">
                  Select candidates from Level 2 (Coding) to qualify for Level 3 Presentation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPromoteModal(false)}
                className="text-lg font-bold text-[#8B93A0] hover:text-[#1B2029]"
              >
                ×
              </button>
            </div>

            {/* Option A: Promote Top N */}
            <div className="p-3 bg-[#F6F6F2] rounded-[4px] border border-[#DBD7C9] space-y-2">
              <div className="font-semibold text-[#16233F]">Option A: Promote Top N Coding Finalists</div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={promoteTopN}
                  onChange={(e) => setPromoteTopN(Number(e.target.value))}
                  className="w-24 h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-mono"
                />
                <button
                  type="button"
                  disabled={isPromoting}
                  onClick={handlePromoteTopN}
                  className="px-3 py-1.5 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B]"
                >
                  {isPromoting ? 'Promoting…' : `Promote Top ${promoteTopN}`}
                </button>
              </div>
            </div>

            {/* Option B: Promote by Minimum Coding Score Cutoff */}
            <div className="p-3 bg-[#F6F6F2] rounded-[4px] border border-[#DBD7C9] space-y-2">
              <div className="font-semibold text-[#16233F]">Option B: Cutoff Promotion (Score Threshold)</div>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={promoteCutoff}
                  onChange={(e) => setPromoteCutoff(Number(e.target.value))}
                  className="w-24 h-8 px-2.5 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-mono"
                />
                <button
                  type="button"
                  disabled={isPromoting}
                  onClick={handlePromoteByCutoff}
                  className="px-3 py-1.5 bg-[#8A5A00] text-white text-xs font-bold rounded-[3px] hover:bg-[#6D4700]"
                >
                  {isPromoting ? 'Promoting…' : `Promote Score >= ${promoteCutoff}`}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowPromoteModal(false)}
                className="px-4 py-2 bg-white border border-[#DBD7C9] text-[#59626F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* GLOBAL EMERGENCY REASSIGN / TECHNICAL RESET MODAL (Accessible across all tabs & roles) */}
      {selectedParticipantForEmergency && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[6px] max-w-lg w-full p-6 shadow-2xl border border-[#DBD7C9] space-y-4 animate-in fade-in">
            <div className="border-b border-[#DBD7C9] pb-3 flex justify-between items-start">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#A82A2A] font-bold">
                  Emergency Operations &amp; Recovery
                </div>
                <h3 className="font-serif text-lg font-bold text-[#16233F]">
                  {selectedParticipantForEmergency.roll_number} — {selectedParticipantForEmergency.name}
                </h3>
                <div className="text-xs text-[#59626F]">
                  Year {selectedParticipantForEmergency.academic_year} · {selectedParticipantForEmergency.email || selectedParticipantForEmergency.roll_number}
                </div>
              </div>
              <button
                onClick={() => setSelectedParticipantForEmergency(null)}
                className="text-[#8B93A0] hover:text-[#16233F] font-bold text-lg px-2"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#59626F]">
              Use these recovery controls if the student experienced a power cut, system crash, network error, or needs emergency qualification/reassignment.
            </p>

            <div className="space-y-3">
              {/* Action 1: Reset Level 1 */}
              <div className="bg-[#F6F6F2] p-3 rounded border border-[#DBD7C9] flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-xs text-[#16233F] flex items-center space-x-1.5">
                    <span>🔄 Reset Level 1 (MCQ)</span>
                  </div>
                  <p className="text-[11px] text-[#59626F] mt-0.5">
                    Clears MCQ attempt, answers &amp; violations. Gives student a fresh 30-minute timer.
                  </p>
                </div>
                <button
                  onClick={() => handleResetLevel1(selectedParticipantForEmergency)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-[#A82A2A] text-white font-semibold text-xs rounded hover:bg-[#8B2020] shrink-0 disabled:opacity-50"
                >
                  Reset Level 1
                </button>
              </div>

              {/* Action 2: Reset Level 2 */}
              <div className="bg-[#F6F6F2] p-3 rounded border border-[#DBD7C9] flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-xs text-[#16233F] flex items-center space-x-1.5">
                    <span>💻 Reset Level 2 (Debugging)</span>
                  </div>
                  <p className="text-[11px] text-[#59626F] mt-0.5">
                    Clears Debugging answers, timer &amp; violations. Re-opens debugging challenge session.
                  </p>
                </div>
                <button
                  onClick={() => handleResetLevel2(selectedParticipantForEmergency)}
                  disabled={loading}
                  className="px-3 py-1.5 bg-[#A82A2A] text-white font-semibold text-xs rounded hover:bg-[#8B2020] shrink-0 disabled:opacity-50"
                >
                  Reset Level 2
                </button>
              </div>

              {/* Action 3: Qualify or Disqualify Level 2 */}
              <div className="bg-[#F6F6F2] p-3 rounded border border-[#DBD7C9] flex items-center justify-between gap-3">
                <div>
                  <div className={`font-bold text-xs flex items-center space-x-1.5 ${selectedParticipantForEmergency.mcq_qualified ? 'text-[#A82A2A]' : 'text-[#1E7E34]'}`}>
                    <span>{selectedParticipantForEmergency.mcq_qualified ? '❌ Revoke Level 2 Entry' : '🏆 Direct Qualify for Level 2'}</span>
                  </div>
                  <p className="text-[11px] text-[#59626F] mt-0.5">
                    {selectedParticipantForEmergency.mcq_qualified ? 'Revokes Round 2 entry and marks candidate as not qualified.' : 'Manually grants immediate entry to Round 2 without taking Level 1.'}
                  </p>
                </div>
                <button
                  onClick={() => handleOverrideLevel2(selectedParticipantForEmergency, !selectedParticipantForEmergency.mcq_qualified)}
                  disabled={loading}
                  className={`px-3 py-1.5 text-white font-semibold text-xs rounded shrink-0 disabled:opacity-50 ${
                    selectedParticipantForEmergency.mcq_qualified
                      ? 'bg-[#A82A2A] hover:bg-[#8B2020]'
                      : 'bg-[#1E7E34] hover:bg-[#166027]'
                  }`}
                >
                  {selectedParticipantForEmergency.mcq_qualified ? 'Disqualify from R2' : 'Qualify for R2'}
                </button>
              </div>

              {/* Action 4: Reset Password */}
              <div className="bg-[#F6F6F2] p-3 rounded border border-[#DBD7C9] flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-xs text-[#16233F]">
                    🔑 Reset Password
                  </div>
                  <p className="text-[11px] text-[#59626F] mt-0.5">
                    Resets login password back to Roll Number ({selectedParticipantForEmergency.roll_number}).
                  </p>
                </div>
                <button
                  onClick={() => handleResetPin(selectedParticipantForEmergency.id || selectedParticipantForEmergency.participant_id, selectedParticipantForEmergency.roll_number)}
                  className="px-3 py-1.5 bg-[#16233F] text-white font-semibold text-xs rounded hover:bg-[#25355B] shrink-0"
                >
                  Reset Pass
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#DBD7C9]">
              <button
                onClick={() => setSelectedParticipantForEmergency(null)}
                className="px-4 py-1.5 border border-[#C6C1B0] rounded text-xs font-medium hover:bg-[#F6F6F2]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  );
};
