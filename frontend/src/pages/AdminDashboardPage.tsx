import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { apiFetch } from '../api/client';

type Tab = 'overview' | 'participants' | 'mcq' | 'coding' | 'settings' | 'export' | 'organizers' | 'winners1' | 'winners2' | 'presentation' | 'devices';

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

  // Connected Devices (Judge0 Nodes) state
  const [nodesData, setNodesData] = useState<any>(null);
  const [nodesLoading, setNodesLoading] = useState<boolean>(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState<boolean>(false);
  const [newNodeForm, setNewNodeForm] = useState({ name: '', endpoint_url: '' });
  const [isAddingNode, setIsAddingNode] = useState<boolean>(false);
  const [testNodeResult, setTestNodeResult] = useState<any>(null);
  const [isTestingNode, setIsTestingNode] = useState<boolean>(false);
  const [pingingNodeId, setPingingNodeId] = useState<string | null>(null);

  const fetchNodes = async () => {
    setNodesLoading(true);
    try {
      const data = await apiFetch<any>('/admin/nodes');
      setNodesData(data);
    } catch (e: any) {
      console.error('Failed to fetch Judge0 nodes', e);
      setMessage(`Failed to load connected devices: ${e?.detail || e.message}`);
    } finally {
      setNodesLoading(false);
    }
  };

  const handleToggleNode = async (nodeId: string) => {
    try {
      const updated = await apiFetch<any>(`/admin/nodes/${nodeId}/toggle`, { method: 'PUT' });
      setMessage(`Node ${updated.name || updated.endpoint_url} is now ${updated.is_active ? 'ACTIVE' : 'MUTED (STANDBY)'}.`);
      fetchNodes();
    } catch (e: any) {
      alert(`Failed to toggle node: ${e?.detail || e.message}`);
    }
  };

  const handleDeleteNode = async (nodeId: string, nodeName: string) => {
    if (!confirm(`Are you sure you want to disconnect and remove node "${nodeName}"?`)) return;
    try {
      const res = await apiFetch<any>(`/admin/nodes/${nodeId}`, { method: 'DELETE' });
      setMessage(res.message || `Node disconnected.`);
      fetchNodes();
    } catch (e: any) {
      alert(`Failed to remove node: ${e?.detail || e.message}`);
    }
  };

  const handleTestSpecificNode = async (endpointUrl: string, nodeId?: string) => {
    if (nodeId) setPingingNodeId(nodeId);
    try {
      const res = await apiFetch<any>('/admin/nodes/test', {
        method: 'POST',
        body: JSON.stringify({ endpoint_url: endpointUrl })
      });
      if (res.is_online) {
        alert(`✅ Online! Latency: ${res.latency_ms} ms (Judge0 version: ${res.version || 'CE'})`);
      } else {
        alert(`❌ Offline: ${res.error || 'Connection timed out'}`);
      }
      fetchNodes();
    } catch (e: any) {
      alert(`Test ping failed: ${e?.detail || e.message}`);
    } finally {
      if (nodeId) setPingingNodeId(null);
    }
  };

  const handleTestModalNode = async () => {
    if (!newNodeForm.endpoint_url.trim()) return;
    setIsTestingNode(true);
    setTestNodeResult(null);
    try {
      const res = await apiFetch<any>('/admin/nodes/test', {
        method: 'POST',
        body: JSON.stringify({ endpoint_url: newNodeForm.endpoint_url })
      });
      setTestNodeResult(res);
    } catch (e: any) {
      setTestNodeResult({ is_online: false, error: e?.detail || e.message });
    } finally {
      setIsTestingNode(false);
    }
  };

  const handleAddNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeForm.endpoint_url.trim()) return;
    setIsAddingNode(true);
    try {
      const res = await apiFetch<any>('/admin/nodes', {
        method: 'POST',
        body: JSON.stringify(newNodeForm)
      });
      setMessage(`Judge0 node "${res.name}" connected successfully.`);
      setShowAddNodeModal(false);
      setNewNodeForm({ name: '', endpoint_url: '' });
      setTestNodeResult(null);
      fetchNodes();
    } catch (e: any) {
      alert(`Failed to register node: ${e?.detail || e.message}`);
    } finally {
      setIsAddingNode(false);
    }
  };

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
      else if (activeTab === 'devices') await fetchNodes();
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
    if (!isSuperAdmin && activeTab !== 'export' && activeTab !== 'winners1' && activeTab !== 'winners2' && activeTab !== 'presentation' && activeTab !== 'devices') {
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

  const handleResetLevel1 = async (p: any) => {
    if (!confirm(`Are you sure you want to completely RESET Level 1 (MCQ Assessment) for ${p.roll_number} (${p.name})?\n\nThis will clear their previous attempt, answers, violations, and timer, letting them start Level 1 freshly.`)) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/admin/participants/${p.id}/reset-level1`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      alert(res.message || `Level 1 reset for ${p.roll_number}.`);
      setMessage(res.message);
      setSelectedParticipantForEmergency(null);
      fetchParticipants();
    } catch (e: any) {
      alert(`Failed to reset Level 1: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetLevel2 = async (p: any) => {
    if (!confirm(`Are you sure you want to completely RESET Level 2 (Coding Assessment) for ${p.roll_number} (${p.name})?\n\nThis will clear their coding submissions, violations, and timer, letting them start Level 2 freshly.`)) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/admin/participants/${p.id}/reset-level2`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      alert(res.message || `Level 2 reset for ${p.roll_number}.`);
      setMessage(res.message);
      setSelectedParticipantForEmergency(null);
      fetchParticipants();
    } catch (e: any) {
      alert(`Failed to reset Level 2: ${e?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOverrideLevel2 = async (p: any) => {
    if (!confirm(`Manually QUALIFY ${p.roll_number} (${p.name}) for Level 2 (Coding)?\n\nThis allows the student to immediately enter Level 2 even if they had a device issue in Level 1.`)) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/admin/participants/${p.id}/override-level2-qualification`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      alert(res.message || `${p.roll_number} qualified for Level 2.`);
      setMessage(res.message);
      setSelectedParticipantForEmergency(null);
      fetchParticipants();
    } catch (e: any) {
      alert(`Failed to qualify for Level 2: ${e?.detail || e.message}`);
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
        { id: 'devices' as Tab, label: '🖥️ Connected Devices' },
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
        { id: 'presentation' as Tab, label: '🎤 Level 3 Evaluation' },
        { id: 'devices' as Tab, label: '🖥️ Connected Devices' },
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

              {/* Emergency Reassign / Technical Reset Modal */}
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
                          Year {selectedParticipantForEmergency.academic_year} · {selectedParticipantForEmergency.email}
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
                      Use these recovery controls if the student experienced a power cut, system crash, or technical glitch during the contest.
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
                            <span>💻 Reset Level 2 (Coding)</span>
                          </div>
                          <p className="text-[11px] text-[#59626F] mt-0.5">
                            Clears Coding submissions, timer &amp; violations. Re-opens coding environment.
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

                      {/* Action 3: Force Qualify Level 2 */}
                      <div className="bg-[#F6F6F2] p-3 rounded border border-[#DBD7C9] flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-xs text-[#1E7E34] flex items-center space-x-1.5">
                            <span>🏆 Direct Qualify for Level 2</span>
                          </div>
                          <p className="text-[11px] text-[#59626F] mt-0.5">
                            Manually grants entry to Round 2 without requiring Level 1 score.
                          </p>
                        </div>
                        <button
                          onClick={() => handleOverrideLevel2(selectedParticipantForEmergency)}
                          disabled={loading}
                          className="px-3 py-1.5 bg-[#1E7E34] text-white font-semibold text-xs rounded hover:bg-[#166027] shrink-0 disabled:opacity-50"
                        >
                          Qualify for R2
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
                          onClick={() => handleResetPin(selectedParticipantForEmergency.id, selectedParticipantForEmergency.roll_number)}
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
                  <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-6 max-w-2xl w-full text-xs space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
                    <div className="border-b border-[#DBD7C9] pb-2">
                      <h3 className="text-sm font-bold text-[#16233F]">Create New Coding Problem</h3>
                      <p className="text-[11px] text-[#59626F]">Add a new Level 2 programming challenge with public &amp; hidden evaluation test cases</p>
                    </div>

                    <form onSubmit={handleAddProblem} className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Problem Title</label>
                          <input
                            value={newProb.title}
                            onChange={(e) => setNewProb({ ...newProb, title: e.target.value })}
                            placeholder="e.g. Two Sum or Valid Palindrome"
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
                          placeholder="Describe the problem, input format, and output format..."
                          className="w-full border border-[#C6C1B0] p-2 rounded h-20 font-sans text-xs"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#59626F] font-bold uppercase mb-1">Constraints &amp; Limits</label>
                        <textarea
                          value={newProb.constraints}
                          onChange={(e) => setNewProb({ ...newProb, constraints: e.target.value })}
                          placeholder="1 <= N <= 10^5&#10;Time Limit: 2000ms"
                          className="w-full border border-[#C6C1B0] p-2 rounded h-14 font-mono text-xs"
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

                      {/* Initial Test Cases Section */}
                      <div className="border-t border-[#DBD7C9] pt-3">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-bold text-[#16233F] uppercase tracking-wider text-[11px]">
                            Initial Test Cases ({newProb.test_cases.length})
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              setNewProb({
                                ...newProb,
                                test_cases: [
                                  ...newProb.test_cases,
                                  {
                                    input_data: '',
                                    expected_output: '',
                                    is_hidden: newProb.test_cases.length > 0,
                                    order_num: newProb.test_cases.length + 1
                                  }
                                ]
                              });
                            }}
                            className="text-[11px] text-[#1E7E34] hover:underline font-semibold"
                          >
                            + Add Another Test Case
                          </button>
                        </div>

                        <div className="space-y-3">
                          {newProb.test_cases.map((tc, tcIdx) => (
                            <div key={tcIdx} className="bg-[#F6F6F2] p-3 rounded border border-[#DBD7C9] space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-mono font-bold text-[11px] text-[#16233F]">
                                  Test Case #{tcIdx + 1}
                                </span>
                                <div className="flex items-center space-x-3">
                                  <label className="flex items-center space-x-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={tc.is_hidden}
                                      onChange={(e) => {
                                        const updated = [...newProb.test_cases];
                                        updated[tcIdx].is_hidden = e.target.checked;
                                        setNewProb({ ...newProb, test_cases: updated });
                                      }}
                                    />
                                    <span className="text-[10.5px] font-semibold text-[#59626F]">Hidden for Evaluation</span>
                                  </label>
                                  {newProb.test_cases.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = newProb.test_cases.filter((_, i) => i !== tcIdx);
                                        setNewProb({ ...newProb, test_cases: updated });
                                      }}
                                      className="text-[#A82A2A] hover:underline text-[10.5px]"
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                                <div>
                                  <label className="block text-[9.5px] text-[#59626F] uppercase font-bold mb-0.5">
                                    Standard Input (stdin)
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={tc.input_data}
                                    onChange={(e) => {
                                      const updated = [...newProb.test_cases];
                                      updated[tcIdx].input_data = e.target.value;
                                      setNewProb({ ...newProb, test_cases: updated });
                                    }}
                                    placeholder="e.g. 10 20 or [2,7,11,15]|9"
                                    className="w-full border border-[#C6C1B0] p-1.5 rounded font-mono text-[11px] bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9.5px] text-[#59626F] uppercase font-bold mb-0.5">
                                    Expected Output (stdout)
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={tc.expected_output}
                                    onChange={(e) => {
                                      const updated = [...newProb.test_cases];
                                      updated[tcIdx].expected_output = e.target.value;
                                      setNewProb({ ...newProb, test_cases: updated });
                                    }}
                                    placeholder="e.g. 30 or [0,1]"
                                    className="w-full border border-[#C6C1B0] p-1.5 rounded font-mono text-[11px] bg-white font-bold text-[#1E7A46]"
                                    required
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
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
                          disabled={loading}
                          className="px-4 py-1.5 bg-[#16233F] text-white rounded text-xs font-semibold hover:bg-[#25355B] disabled:opacity-50"
                        >
                          {loading ? 'Creating…' : 'Create Problem'}
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
                      <h3 className="text-sm font-bold text-[#16233F]">Add Custom Test Case</h3>
                      <p className="text-[11px] text-[#59626F]">Define specific input arguments and expected output</p>
                    </div>

                    <form onSubmit={handleAddTestCase} className="space-y-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase">
                            Standard Input (stdin)
                          </label>
                          <span className="text-[10px] text-[#8B93A0]">Space / Comma / Multiline / Pipe supported</span>
                        </div>
                        <textarea
                          rows={4}
                          value={newTestCase.input_data}
                          onChange={(e) => setNewTestCase({ ...newTestCase, input_data: e.target.value })}
                          placeholder="e.g.&#10;10 20&#10;or: [2, 7, 11, 15] | 9&#10;or: hello world"
                          className="w-full border border-[#C6C1B0] p-2 rounded font-mono text-xs focus:outline-none focus:border-[#16233F]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[10px] text-[#59626F] font-bold uppercase">
                            Expected Output (stdout)
                          </label>
                          <span className="text-[10px] text-[#8B93A0]">Exact text or number to match</span>
                        </div>
                        <textarea
                          rows={3}
                          value={newTestCase.expected_output}
                          onChange={(e) => setNewTestCase({ ...newTestCase, expected_output: e.target.value })}
                          placeholder="e.g. 30 or [0, 1] or true"
                          required
                          className="w-full border border-[#C6C1B0] p-2 rounded font-mono text-xs focus:outline-none focus:border-[#16233F] font-bold text-[#1E7A46]"
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
                              <span className="font-semibold text-[#1E7A46]">👁 Public Sample</span>
                            </label>
                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name="is_hidden"
                                checked={newTestCase.is_hidden}
                                onChange={() => setNewTestCase({ ...newTestCase, is_hidden: true })}
                              />
                              <span className="font-semibold text-[#C0392B]">🔒 Hidden Case</span>
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
                      `round2_coding_results${r2YearFilter ? `_y${r2YearFilter}` : ''}${r2TopLimit ? `_top${r2TopLimit}` : ''}.csv`,
                      ['Rank','Roll Number','Name','Year','MCQ Score (/25)','Coding Score (/60)','Total Score','Violations'],
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
                        {w?.coding_score ?? 0}<span className="text-sm text-[#8B93A0]"> / 60 pts (Code)</span>
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
                      <th className="py-2.5 px-3 text-center">Coding (/60)</th>
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

          {/* TAB: CONNECTED DEVICES (JUDGE0 NODES) */}
          {activeTab === 'devices' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-[#16233F] flex items-center space-x-2">
                    <span>🖥️ Connected Devices &amp; Judge0 Cluster</span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#16233F] text-white">
                      Distributed Execution
                    </span>
                  </h2>
                  <p className="text-xs text-[#59626F]">
                    Real-time cluster telemetry, health monitoring, and node pairing for distributed code evaluation.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={fetchNodes}
                    disabled={nodesLoading}
                    className="px-3 py-1.5 bg-white border border-[#DBD7C9] text-[#16233F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2] transition-colors flex items-center space-x-1.5 shadow-sm"
                  >
                    <span className={nodesLoading ? 'animate-spin inline-block' : ''}>🔄</span>
                    <span>{nodesLoading ? 'Testing Pings…' : 'Re-scan Nodes'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setTestNodeResult(null);
                      setNewNodeForm({ name: '', endpoint_url: '' });
                      setShowAddNodeModal(true);
                    }}
                    className="px-3.5 py-1.5 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] transition-colors flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>➕</span>
                    <span>Connect New Device</span>
                  </button>
                </div>
              </div>

              {/* Cluster Telemetry Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-3.5 shadow-sm">
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#59626F]">
                    Total Registered Nodes
                  </div>
                  <div className="text-2xl font-bold font-mono text-[#16233F] mt-1">
                    {nodesData?.summary?.total_nodes ?? (nodesLoading ? '…' : 0)}
                  </div>
                  <div className="text-[11px] text-[#59626F] mt-0.5">
                    Distributed runner endpoints
                  </div>
                </div>

                <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-3.5 shadow-sm">
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#59626F]">
                    Cluster Health
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      (nodesData?.summary?.online_nodes || 0) > 0 ? 'bg-[#1E7A46] animate-pulse' : 'bg-[#A82A2A]'
                    }`} />
                    <span className="text-2xl font-bold font-mono text-[#16233F]">
                      {nodesData?.summary?.online_nodes ?? 0} <span className="text-xs text-[#8B93A0]">/ {nodesData?.summary?.total_nodes ?? 0} Online</span>
                    </span>
                  </div>
                  <div className="text-[11px] text-[#59626F] mt-0.5">
                    {(nodesData?.summary?.online_nodes || 0) > 0 ? 'Cluster dispatch active' : 'All remote nodes offline'}
                  </div>
                </div>

                <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-3.5 shadow-sm">
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#59626F]">
                    Average Ping
                  </div>
                  <div className="text-2xl font-bold font-mono text-[#16233F] mt-1">
                    {nodesData?.summary?.avg_latency_ms ? `${nodesData.summary.avg_latency_ms} ms` : 'N/A'}
                  </div>
                  <div className="text-[11px] text-[#59626F] mt-0.5">
                    {nodesData?.summary?.avg_latency_ms && nodesData.summary.avg_latency_ms < 50 ? '⚡ Ultra-fast LAN latency' : 'Response roundtrip'}
                  </div>
                </div>

                <div className="bg-[#F0FBF4] border border-[#2EA043]/30 rounded-[4px] p-3.5 shadow-sm">
                  <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#1E7A46] font-bold">
                    Local Sandbox Engine
                  </div>
                  <div className="text-sm font-bold text-[#16233F] mt-1 flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#1E7A46]" />
                    <span>🟢 ALWAYS READY</span>
                  </div>
                  <div className="text-[11px] text-[#59626F] mt-0.5">
                    Zero-downtime local failover
                  </div>
                </div>
              </div>

              {/* Connected Nodes Table */}
              <div className="bg-white border border-[#DBD7C9] rounded-[4px] overflow-hidden shadow-sm">
                <div className="p-3 bg-[#F6F6F2] border-b border-[#DBD7C9] flex items-center justify-between">
                  <div className="font-semibold text-xs text-[#16233F]">
                    Configured Nodes ({nodesData?.nodes?.length || 0})
                  </div>
                  <span className="text-[11px] text-[#59626F] font-mono">
                    Round-Robin Rotation with 60s Circuit Breaker
                  </span>
                </div>

                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#DBD7C9] bg-[#FAF8F5] text-[#59626F] font-semibold">
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Node / Machine</th>
                      <th className="py-2.5 px-3 font-mono">Endpoint (URL)</th>
                      <th className="py-2.5 px-3 text-center">Ping (ms)</th>
                      <th className="py-2.5 px-3 text-center">Engine / Version</th>
                      <th className="py-2.5 px-3 text-center">Languages</th>
                      <th className="py-2.5 px-3 text-center">Dispatch State</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DBD7C9]">
                    {nodesData?.nodes?.map((node: any) => (
                      <tr key={node.id} className="hover:bg-[#F6F6F2]/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10.5px] font-bold font-mono ${
                            node.is_online
                              ? 'bg-[#E8F3EC] text-[#1E7E34] border border-[#1E7E34]/30'
                              : 'bg-[#FCEDEC] text-[#A82A2A] border border-[#A82A2A]/30'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${node.is_online ? 'bg-[#1E7E34] animate-pulse' : 'bg-[#A82A2A]'}`} />
                            <span>{node.is_online ? 'ONLINE' : 'OFFLINE'}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#16233F]">{node.name}</div>
                          {node.error && (
                            <div className="text-[10px] text-[#A82A2A] font-mono mt-0.5 truncate max-w-[180px]" title={node.error}>
                              Err: {node.error}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#16233F] font-medium">
                          {node.endpoint_url}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {node.is_online && node.latency_ms !== null ? (
                            <span className="font-bold text-[#1E7E34]">{node.latency_ms} ms</span>
                          ) : (
                            <span className="text-[#8B93A0]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-[11px] text-[#59626F]">
                          {node.is_online ? `Judge0 v${node.version || '1.13.1'}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-flex space-x-1 font-mono text-[10px]">
                            <span className="bg-[#F6F6F2] px-1 py-0.5 rounded text-[#16233F]">Py</span>
                            <span className="bg-[#F6F6F2] px-1 py-0.5 rounded text-[#16233F]">C</span>
                            <span className="bg-[#F6F6F2] px-1 py-0.5 rounded text-[#16233F]">C++</span>
                            <span className="bg-[#F6F6F2] px-1 py-0.5 rounded text-[#16233F]">Java</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleNode(node.id)}
                            className={`px-2 py-0.5 text-[10.5px] font-semibold rounded transition-colors ${
                              node.is_active
                                ? 'bg-[#16233F] text-white hover:bg-[#25355B]'
                                : 'bg-[#E0E0DB] text-[#59626F] hover:bg-[#D0D0CB]'
                            }`}
                            title={node.is_active ? 'Click to Mute/Standby' : 'Click to Activate'}
                          >
                            {node.is_active ? 'Active' : 'Standby'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-2">
                          <button
                            onClick={() => handleTestSpecificNode(node.endpoint_url, node.id)}
                            disabled={pingingNodeId === node.id}
                            className="px-2 py-1 bg-white border border-[#DBD7C9] text-[#16233F] text-[11px] font-semibold rounded hover:bg-[#F6F6F2] transition-colors"
                          >
                            {pingingNodeId === node.id ? 'Pinging…' : 'Ping Test'}
                          </button>
                          <button
                            onClick={() => handleDeleteNode(node.id, node.name)}
                            className="text-[#A82A2A] hover:underline font-mono text-[11px]"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {(!nodesData?.nodes || nodesData.nodes.length === 0) && (
                  <div className="p-8 text-center space-y-3">
                    <div className="text-3xl">🖥️</div>
                    <div className="text-xs text-[#59626F]">No Judge0 nodes currently registered.</div>
                    <button
                      onClick={() => setShowAddNodeModal(true)}
                      className="px-3 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded"
                    >
                      Connect First Device
                    </button>
                  </div>
                )}
              </div>

              {/* Step-by-Step Setup Guide Card */}
              <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#DBD7C9] pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">⚡</span>
                    <h3 className="font-serif font-bold text-sm text-[#16233F]">
                      Simplest Guide: Turn Any Laptop or Lab PC into a Judge0 Node (3 Minutes)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-[#1E7E34] bg-[#E8F3EC] px-2 py-0.5 rounded font-bold">
                    Plug &amp; Play
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Step 1 */}
                  <div className="bg-[#F6F6F2] p-3.5 rounded border border-[#DBD7C9] space-y-2">
                    <div className="font-bold text-[#16233F] flex items-center space-x-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#16233F] text-white text-[10px] inline-flex items-center justify-center font-bold">1</span>
                      <span>Prerequisites &amp; Network</span>
                    </div>
                    <p className="text-[#59626F] text-[11.5px] leading-relaxed">
                      Install <strong>Docker Desktop</strong> on Windows/Mac, or Docker CE on Linux.
                    </p>
                    <div className="p-2 bg-[#EEF1F6] rounded border border-[#C6C1B0] text-[11px] text-[#16233F] space-y-1">
                      <div>☁️ <strong>Cloudflare Tunnel (Best for Render Cloud):</strong> Download <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" target="_blank" rel="noreferrer" className="underline font-bold text-[#16233F]">cloudflared</a> on the PC running Judge0. It creates a secure, public HTTPS link that Render can reach instantly!</div>
                      <div>🛡️ <strong>Tailscale (For Local Servers):</strong> If running CodeFest on a local PC, Tailscale unifies all PCs into one private mesh.</div>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="bg-[#F6F6F2] p-3.5 rounded border border-[#DBD7C9] space-y-2">
                    <div className="font-bold text-[#16233F] flex items-center space-x-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#16233F] text-white text-[10px] inline-flex items-center justify-center font-bold">2</span>
                      <span>Start Judge0 Container</span>
                    </div>
                    <p className="text-[#59626F] text-[11.5px] leading-relaxed">
                      Open PowerShell or Terminal on that machine and run:
                    </p>
                    <pre className="p-2 bg-[#16233F] text-[#E8F3EC] rounded text-[10px] font-mono overflow-x-auto select-all">
                      docker run -d -p 2358:2358 judge0/judge0:v1.13.1
                    </pre>
                    <p className="text-[10.5px] text-[#59626F]">
                      (Port 2358 will now be listening for code evaluation requests)
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="bg-[#F6F6F2] p-3.5 rounded border border-[#DBD7C9] space-y-2">
                    <div className="font-bold text-[#16233F] flex items-center space-x-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#16233F] text-white text-[10px] inline-flex items-center justify-center font-bold">3</span>
                      <span>Expose &amp; Connect to CodeFest</span>
                    </div>
                    <p className="text-[#59626F] text-[11.5px] leading-relaxed">
                      <strong>If backend is on Render:</strong> Run <code className="p-1 bg-[#EEF1F6] text-[#16233F] rounded font-bold font-mono">cloudflared tunnel --url http://localhost:2358</code> and copy the <code className="font-bold">https://xxx.trycloudflare.com</code> URL.
                    </p>
                    <p className="text-[#59626F] text-[11.5px]">
                      <strong>If backend is Local:</strong> Copy the Tailscale IP (<code className="font-mono font-bold">http://100.x.y.z:2358</code>).
                    </p>
                    <p className="text-[#59626F] text-[11px]">
                      Click <strong>"Connect New Device"</strong> above, paste the URL, test ping, and save!
                    </p>
                  </div>
                </div>
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

      {/* CONNECT NEW DEVICE MODAL */}
      {showAddNodeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="border-b border-[#DBD7C9] pb-3 flex items-start justify-between">
              <div>
                <h3 className="font-serif text-[18px] font-bold text-[#16233F]">
                  Connect New Judge0 Execution Node
                </h3>
                <p className="text-xs text-[#59626F] mt-0.5">
                  Pair another laptop or lab PC to expand concurrent code execution capacity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddNodeModal(false)}
                className="text-lg font-bold text-[#8B93A0] hover:text-[#1B2029]"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddNode} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#16233F] mb-1">
                  Device / Machine Name:
                </label>
                <input
                  type="text"
                  required
                  placeholder="E.g., Lab PC 204 or Faculty Laptop - Rohan"
                  value={newNodeForm.name}
                  onChange={(e) => setNewNodeForm({ ...newNodeForm, name: e.target.value })}
                  className="w-full h-8 px-3 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#16233F] mb-1">
                  Judge0 Endpoint URL (Cloudflare Tunnel, Tailscale, or LAN IP):
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    required
                    placeholder="https://xxx.trycloudflare.com or http://100.x.y.z:2358"
                    value={newNodeForm.endpoint_url}
                    onChange={(e) => {
                      setNewNodeForm({ ...newNodeForm, endpoint_url: e.target.value });
                      setTestNodeResult(null);
                    }}
                    className="flex-1 h-8 px-3 text-xs border border-[#C6C1B0] rounded-[3px] bg-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleTestModalNode}
                    disabled={isTestingNode || !newNodeForm.endpoint_url.trim()}
                    className="px-3 h-8 bg-white border border-[#DBD7C9] text-[#16233F] font-semibold text-xs rounded hover:bg-[#F6F6F2] disabled:opacity-50 shrink-0"
                  >
                    {isTestingNode ? 'Testing…' : 'Test Ping'}
                  </button>
                </div>
                <p className="text-[10.5px] text-[#59626F] mt-1.5 leading-relaxed">
                  ☁️ <strong>Cloudflare Tunnel (https://xxx.trycloudflare.com)</strong> is best when using Render cloud backend.<br />
                  💡 <strong>Tailscale (http://100.x.y.z:2358)</strong> works when both the server and worker node share a virtual network.
                </p>
              </div>

              {/* Test Result Indicator */}
              {testNodeResult && (
                <div className={`p-3 rounded border text-xs font-mono ${
                  testNodeResult.is_online
                    ? 'bg-[#E8F3EC] border-[#1E7E34]/40 text-[#1E7E34]'
                    : 'bg-[#FCEDEC] border-[#A82A2A]/40 text-[#A82A2A]'
                }`}>
                  {testNodeResult.is_online ? (
                    <div>
                      ✅ <strong>Node Reachable!</strong> Latency: {testNodeResult.latency_ms} ms (Judge0 v{testNodeResult.version || '1.13.1'})
                      <div className="text-[10px] mt-0.5 text-[#1E7E34]">
                        Endpoint verified: <code className="font-bold">{testNodeResult.endpoint_url}</code>
                      </div>
                    </div>
                  ) : (
                    <div>
                      ❌ <strong>Connection Failed:</strong> {testNodeResult.error || 'Timed out / connection refused'}
                      <div className="text-[10.5px] mt-1 text-[#16233F]">
                        Tested endpoint: <code className="bg-white/80 px-1 py-0.5 rounded font-bold">{testNodeResult.endpoint_url}</code>
                      </div>
                      <div className="text-[10px] mt-1.5 text-[#59626F] leading-tight space-y-0.5">
                        <div>Checklist:</div>
                        <div>• <strong>Cloudflare:</strong> Run <code className="bg-black/5 px-1 rounded">cloudflared tunnel --url http://localhost:2358</code> on the lab PC.</div>
                        <div>• <strong>Tailscale/IP:</strong> Ensure port <code className="bg-black/5 px-1 rounded">:2358</code> is open and Docker is running.</div>
                        <div>• <strong>Docker:</strong> Run <code className="bg-black/5 px-1 rounded">docker ps</code> to confirm judge0-server is UP.</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#DBD7C9]">
                <button
                  type="button"
                  onClick={() => setShowAddNodeModal(false)}
                  className="px-4 py-2 bg-white border border-[#DBD7C9] text-[#59626F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingNode}
                  className="px-5 py-2 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] disabled:opacity-50"
                >
                  {isAddingNode ? 'Connecting…' : 'Save & Register Node'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  );
};
