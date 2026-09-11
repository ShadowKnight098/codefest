import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';
import type { DashboardState, ParticipantMarks } from '../types/auth';

interface DashboardPageProps {
  onStartMCQ?: () => void;
  onStartCoding?: () => void;
}

// Exact state configurations per spec
interface DisplayStateConfig {
  r1: {
    status: 'Available' | 'In Progress' | 'Completed' | 'Qualified' | 'Locked' | 'Terminated';
    sub: string;
    action?: 'Enter Assessment' | 'Resume';
  };
  r2: {
    status: 'Available' | 'In Progress' | 'Completed' | 'Qualified' | 'Locked' | 'Terminated';
    sub: string;
    action?: 'Enter Assessment' | 'Resume';
  };
  r3: {
    status: 'Locked';
    sub: string;
  };
  panel: {
    type: 'default' | 'warn' | 'error' | 'success';
    title: string;
    message: string;
  };
}

const PRESET_STATES: Record<string, DisplayStateConfig> = {
  'LEVEL1_AVAILABLE': {
    r1: { status: 'Available', sub: '25 questions · 30 minutes', action: 'Enter Assessment' },
    r2: { status: 'Locked', sub: 'Opens after Level 1 evaluation' },
    r3: { status: 'Locked', sub: 'Evaluated manually' },
    panel: {
      type: 'default',
      title: 'Level 1 is open',
      message: 'The MCQ assessment is available. You may begin any time before the round closes — once started, the timer cannot be paused.'
    }
  },
  'LEVEL1_IN_PROGRESS': {
    r1: { status: 'In Progress', sub: 'Attempt in progress', action: 'Resume' },
    r2: { status: 'Locked', sub: 'Opens after Level 1 evaluation' },
    r3: { status: 'Locked', sub: 'Evaluated manually' },
    panel: {
      type: 'warn',
      title: 'Assessment in progress',
      message: 'Your Level 1 attempt is currently active. Return to the assessment to continue — closing this tab does not pause your timer.'
    }
  },
  'NOT_QUALIFIED': {
    r1: { status: 'Completed', sub: 'Assessment submitted' },
    r2: { status: 'Locked', sub: 'Shortlisted candidates will be announced in the official group' },
    r3: { status: 'Locked', sub: 'Shortlisted finalists will receive schedule via email' },
    panel: {
      type: 'default',
      title: 'Assessment submitted',
      message: 'Your responses have been recorded. The list of qualified participants for Round 2 will be announced in the official group.'
    }
  },
  'WAITING_FOR_LEVEL2': {
    r1: { status: 'Completed', sub: 'Assessment submitted' },
    r2: { status: 'Locked', sub: 'Shortlisted candidates will be announced in the official group' },
    r3: { status: 'Locked', sub: 'Shortlisted finalists will receive schedule via email' },
    panel: {
      type: 'default',
      title: 'Assessment submitted',
      message: 'Your responses have been recorded. The list of qualified participants for Round 2 will be announced in the official group.'
    }
  },
  'LEVEL2_AVAILABLE': {
    r1: { status: 'Completed', sub: 'Assessment submitted' },
    r2: { status: 'Available', sub: 'Debugging Challenge · 15 Questions · 45 Marks · 60 minutes', action: 'Enter Assessment' },
    r3: { status: 'Locked', sub: 'Evaluated manually' },
    panel: {
      type: 'default',
      title: 'Level 2 is open',
      message: 'The Level 2 Debugging Challenge is available. You may begin any time before the round closes — once started, the timer cannot be paused.'
    }
  },
  'LEVEL2_IN_PROGRESS': {
    r1: { status: 'Completed', sub: 'Assessment submitted' },
    r2: { status: 'In Progress', sub: 'Debugging Challenge in progress', action: 'Resume' },
    r3: { status: 'Locked', sub: 'Evaluated manually' },
    panel: {
      type: 'warn',
      title: 'Assessment in progress',
      message: 'Your Level 2 attempt is currently active. Return to the assessment to continue.'
    }
  },
  'COMPLETED': {
    r1: { status: 'Completed', sub: 'Assessment submitted' },
    r2: { status: 'Completed', sub: 'Assessment submitted' },
    r3: { status: 'Locked', sub: 'Shortlisted candidates will be notified via email or official group' },
    panel: {
      type: 'success',
      title: 'Assessments submitted',
      message: 'You have submitted your assessments. Shortlisted candidates will be notified regarding qualification and next steps via registered email or the official group.'
    }
  },
  'TERMINATED': {
    r1: { status: 'Completed', sub: 'Assessment submitted' },
    r2: { status: 'Terminated', sub: 'Violations exceeded' },
    r3: { status: 'Locked', sub: 'Not applicable' },
    panel: {
      type: 'error',
      title: 'Attempt terminated',
      message: 'Your assessment session was terminated due to security policy violations. Contact your event coordinator if you believe this is an error.'
    }
  }
};

const formatAcademicYear = (year: number | undefined): string => {
  switch (year) {
    case 1: return 'I Year';
    case 2: return 'II Year';
    case 3: return 'III Year';
    case 4: return 'IV Year';
    default: return `${year || 3} Year`;
  }
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onStartMCQ, onStartCoding }) => {
  const { participant, logout } = useAuth();
  const [backendState, setBackendState] = useState<DashboardState | null>(null);
  const [marksData, setMarksData] = useState<ParticipantMarks | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'marks'>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMarks, setLoadingMarks] = useState<boolean>(false);

  // Fetch live server-authoritative state
  const fetchState = async () => {
    try {
      const data = await apiFetch<DashboardState>('/api/dashboard/state');
      setBackendState(data);
    } catch (err) {
      console.error('Failed to load dashboard state:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMarks = async () => {
    setLoadingMarks(true);
    try {
      const data = await apiFetch<ParticipantMarks>('/api/dashboard/marks');
      setMarksData(data);
    } catch (err) {
      console.error('Failed to load participant marks:', err);
    } finally {
      setLoadingMarks(false);
    }
  };

  useEffect(() => {
    fetchState();
    fetchMarks();
    const interval = setInterval(() => {
      fetchState();
      fetchMarks();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeKey: string = backendState?.state || 'LEVEL1_AVAILABLE';
  const displayConfig = PRESET_STATES[activeKey] || PRESET_STATES['LEVEL1_AVAILABLE'];

  // Status Badge Component
  const renderBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return <span className="badge-status badge-completed">Completed</span>;
      case 'Available':
        return <span className="badge-status badge-available">Available</span>;
      case 'In Progress':
        return <span className="badge-status badge-in-progress">In Progress</span>;
      case 'Qualified':
        return <span className="badge-status badge-completed">Qualified</span>;
      case 'Locked':
        return <span className="badge-status badge-locked">Locked</span>;
      case 'Terminated':
        return <span className="badge-status badge-terminated">Terminated</span>;
      default:
        return <span className="badge-status badge-locked">{status}</span>;
    }
  };

  if (loading && !backendState) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center text-[#59626F] text-[14px]">
        Loading dashboard…
      </div>
    );
  }

  const participantName = backendState?.participant_name || participant?.name || 'Anjali Rao';
  const rollNumber = backendState?.roll_number || participant?.roll_number || '21A91A6127';
  const academicYear = formatAcademicYear(backendState?.academic_year || participant?.academic_year);

  const isL2Unlocked = marksData?.coding_status && marksData.coding_status !== 'Not Unlocked';
  const maxTotal = marksData?.max_total_marks || (isL2Unlocked ? 70 : 25);

  return (
    <div className="min-h-screen bg-[#F6F6F2] pb-24">
      <div className="max-w-[880px] mx-auto pt-6 sm:pt-10 px-4 sm:px-6">

        {/* TOPBAR - MOBILE OPTIMIZED */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-[#DBD7C9] gap-3">
          <div>
            <div className="text-[11px] sm:text-[11.5px] font-bold tracking-[0.08em] text-[#59626F] uppercase">
              CSE (AI &amp; ML)
            </div>
            <div className="font-serif text-[20px] sm:text-[22px] font-bold text-[#1B2029] leading-tight">
              CodeFest 2026
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-3 pt-1 sm:pt-0">
            <span className="text-[13px] sm:text-[13.5px] text-[#59626F]">
              Signed in as <strong className="font-semibold text-[#1B2029]">{participantName}</strong>
            </span>
            <button
              onClick={() => logout()}
              className="btn-ghost text-xs px-3 py-1.5 min-h-[36px]"
              type="button"
            >
              Log out
            </button>
          </div>
        </div>

        {/* CREDENTIAL STRIP - MOBILE RESPONSIVE */}
        <div className="mt-5 mb-6 bg-white border border-[#DBD7C9] rounded-[6px] grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#DBD7C9] shadow-sm">
          <div className="p-3.5 sm:p-[18px_22px]">
            <div className="text-[11px] sm:text-[12px] font-semibold text-[#59626F] uppercase tracking-[0.04em]">
              Name
            </div>
            <div className="text-[14.5px] sm:text-[15px] font-semibold text-[#1B2029] mt-0.5 font-sans truncate">
              {participantName}
            </div>
          </div>

          <div className="p-3.5 sm:p-[18px_22px]">
            <div className="text-[11px] sm:text-[12px] font-semibold text-[#59626F] uppercase tracking-[0.04em]">
              Roll number
            </div>
            <div className="text-[14px] sm:text-[14.5px] font-medium text-[#1B2029] mt-0.5 font-mono">
              {rollNumber}
            </div>
          </div>

          <div className="p-3.5 sm:p-[18px_22px]">
            <div className="text-[11px] sm:text-[12px] font-semibold text-[#59626F] uppercase tracking-[0.04em]">
              Academic year
            </div>
            <div className="text-[14.5px] sm:text-[15px] font-semibold text-[#1B2029] mt-0.5 font-sans">
              {academicYear}
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS - MOBILE OPTIMIZED */}
        <div className="flex items-center space-x-2 border-b border-[#DBD7C9] mb-6 pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-[4px] transition-all flex items-center space-x-2 ${
              activeTab === 'overview'
                ? 'bg-[#16233F] text-white shadow-sm'
                : 'bg-white text-[#59626F] hover:text-[#16233F] border border-[#DBD7C9]'
            }`}
          >
            <span>📊</span>
            <span>Competition Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('marks')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-[4px] transition-all flex items-center space-x-2 relative ${
              activeTab === 'marks'
                ? 'bg-[#16233F] text-white shadow-sm'
                : 'bg-white text-[#59626F] hover:text-[#16233F] border border-[#DBD7C9]'
            }`}
          >
            <span>🎯</span>
            <span>My Marks</span>
            {marksData && (marksData.total_score > 0 || marksData.mcq_score !== null) && (
              <span className="w-2 h-2 rounded-full bg-[#1E7A46]"></span>
            )}
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <h2 className="font-serif text-[18px] sm:text-[19px] font-bold text-[#1B2029] mb-3.5">
              Competition progress
            </h2>

            <div className="space-y-3">
              {/* ROUND ROW 01 */}
              <div className={`rounded-[6px] p-4 sm:p-[18px_20px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 border ${
                backendState?.level1_result?.status_label === 'Directly Qualified'
                  ? 'bg-[#FAFAFA] border-[#DBD7C9] opacity-85'
                  : 'bg-white border-[#DBD7C9]'
              }`}>
                <div className="flex items-start sm:items-center space-x-3.5">
                  <div className="w-[30px] h-[30px] border border-[#C6C1B0] rounded-[3px] flex items-center justify-center font-mono text-[13px] font-semibold text-[#59626F] shrink-0 mt-0.5 sm:mt-0">
                    01
                  </div>
                  <div>
                    <div className="text-[14.5px] sm:text-[15px] font-semibold text-[#1B2029]">
                      MCQ Assessment
                    </div>
                    <div className="text-[12px] sm:text-[12.5px] text-[#59626F] mt-0.5 leading-snug">
                      {backendState?.level1_result?.status_label === 'Directly Qualified'
                        ? 'Directly Qualified by Admin · Level 1 Exempted'
                        : backendState?.level1_result
                        ? 'Assessment Submitted · Shortlisted candidates will be announced in the official group'
                        : displayConfig.r1.sub}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:space-x-3 w-full sm:w-auto">
                  <div className="flex justify-end sm:justify-start">
                    {backendState?.level1_result?.status_label === 'Directly Qualified' ? (
                      <span className="badge-status badge-completed">Directly Qualified</span>
                    ) : (
                      renderBadge(displayConfig.r1.status)
                    )}
                  </div>
                  {displayConfig.r1.action && (backendState?.can_start_level1 || backendState?.can_resume_level1) && (
                    <button
                      onClick={() => {
                        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                          document.documentElement.requestFullscreen().catch(() => {});
                        }
                        onStartMCQ?.();
                      }}
                      className="btn-primary h-[38px] px-4 text-[13px] font-semibold flex items-center justify-center space-x-1.5 w-full sm:w-auto"
                      type="button"
                    >
                      <span>{displayConfig.r1.action}</span>
                      <span>→</span>
                    </button>
                  )}
                </div>
              </div>

              {/* ROUND ROW 02 */}
              <div className={`rounded-[6px] p-4 sm:p-[18px_20px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                backendState?.can_start_level2 || backendState?.can_resume_level2
                  ? 'bg-white border-2 border-[#16233F] shadow-sm'
                  : 'bg-white border border-[#DBD7C9]'
              }`}>
                <div className="flex items-start sm:items-center space-x-3.5">
                  <div className={`w-[30px] h-[30px] rounded-[3px] flex items-center justify-center font-mono text-[13px] font-semibold shrink-0 mt-0.5 sm:mt-0 ${
                    backendState?.can_start_level2 || backendState?.can_resume_level2
                      ? 'bg-[#16233F] text-white'
                      : 'border border-[#C6C1B0] text-[#59626F]'
                  }`}>
                    02
                  </div>
                  <div>
                    <div className="text-[14.5px] sm:text-[15px] font-semibold text-[#1B2029]">
                      Debugging Assessment
                    </div>
                    <div className="text-[12px] sm:text-[12.5px] text-[#59626F] mt-0.5 leading-snug">
                      {backendState?.level2_result
                        ? 'Assessment Submitted · Shortlisted candidates will be announced in the official group'
                        : backendState?.can_start_level2
                        ? 'Debugging Challenge · 15 Questions · 45 Marks · 60 minutes'
                        : displayConfig.r2.sub}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:space-x-3 w-full sm:w-auto">
                  <div className="flex justify-end sm:justify-start">
                    {backendState?.can_start_level2 ? renderBadge('Available') : renderBadge(displayConfig.r2.status)}
                  </div>
                  {(backendState?.can_start_level2 || backendState?.can_resume_level2) && (
                    <button
                      onClick={() => {
                        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                          document.documentElement.requestFullscreen().catch(() => {});
                        }
                        onStartCoding?.();
                      }}
                      className="btn-primary h-[38px] px-4 text-[13px] font-semibold flex items-center justify-center space-x-1.5 shadow-sm w-full sm:w-auto"
                      type="button"
                    >
                      <span>{backendState?.can_resume_level2 ? 'Resume' : 'Enter Assessment'}</span>
                      <span>→</span>
                    </button>
                  )}
                </div>
              </div>

              {/* ROUND ROW 03 */}
              <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-4 sm:p-[18px_20px] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center space-x-3.5">
                  <div className="w-[30px] h-[30px] border border-[#C6C1B0] rounded-[3px] flex items-center justify-center font-mono text-[13px] font-semibold text-[#59626F] shrink-0 mt-0.5 sm:mt-0">
                    03
                  </div>
                  <div>
                    <div className="text-[14.5px] sm:text-[15px] font-semibold text-[#1B2029]">
                      Presentation &amp; Viva
                    </div>
                    <div className="text-[12px] sm:text-[12.5px] text-[#59626F] mt-0.5 leading-snug">
                      Presentation &amp; Viva · Shortlisted finalists will receive schedule via email
                    </div>
                  </div>
                </div>

                <div className="flex justify-end sm:justify-start">
                  {renderBadge(displayConfig.r3.status)}
                </div>
              </div>
            </div>

            {/* STATUS PANEL */}
            <div
              className={`mt-5 rounded-[6px] p-4 sm:p-[18px_22px] border ${
                displayConfig.panel.type === 'warn'
                  ? 'bg-[#FBF1DD] border-[#E9D6A3] text-[#8A5A00]'
                  : displayConfig.panel.type === 'error'
                  ? 'bg-[#FBEAE8] border-[#EFC5BF] text-[#AE2E22]'
                  : (displayConfig.panel.type === 'success' || backendState?.state_headline?.includes('Qualified'))
                  ? 'bg-[#E8F3EC] border-[#BEDFCB] text-[#1E7A46]'
                  : 'bg-white border-[#DBD7C9] text-[#1B2029]'
              }`}
            >
              <div className="text-[13.5px] sm:text-[14px] font-bold">
                {backendState?.state_headline || displayConfig.panel.title}
              </div>
              <div className={`text-[12.5px] sm:text-[13px] mt-1 leading-[1.5] ${
                (displayConfig.panel.type === 'default' && !backendState?.state_headline?.includes('Qualified')) ? 'text-[#59626F]' : ''
              }`}>
                {backendState?.state_description || displayConfig.panel.message}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MY MARKS SECTION */}
        {activeTab === 'marks' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-[18px] sm:text-[19px] font-bold text-[#1B2029]">
                My Performance &amp; Marks
              </h2>
              {loadingMarks && (
                <span className="text-xs text-[#59626F] animate-pulse">Updating marks…</span>
              )}
            </div>

            {/* SCORE HIGHLIGHT CARDS (3-COLUMN RESPONSIVE GRID) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-6">
              {/* Card 1: Total Evaluated Score */}
              <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-4 sm:p-5 shadow-sm relative overflow-hidden">
                <div className="text-xs font-semibold text-[#59626F] uppercase tracking-wider">
                  Total Evaluated Score
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-[#1E7A46] mt-2">
                  {marksData?.total_score ?? 0}
                  <span className="text-xs sm:text-sm font-normal text-[#59626F]"> / {maxTotal} pts</span>
                </div>
                {/* Progress Bar */}
                <div className="w-full bg-[#EFECE6] h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-[#1E7A46] h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(((marksData?.total_score || 0) / maxTotal) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Card 2: Overall Rank */}
              <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-4 sm:p-5 shadow-sm">
                <div className="text-xs font-semibold text-[#59626F] uppercase tracking-wider">
                  Leaderboard Rank
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-[#16233F] mt-2 flex items-baseline space-x-1">
                  <span>{marksData?.rank ? `#${marksData.rank}` : '—'}</span>
                  {marksData?.total_participants ? (
                    <span className="text-xs sm:text-sm font-normal text-[#59626F]">
                      of {marksData.total_participants} candidates
                    </span>
                  ) : null}
                </div>
                <div className="text-[11.5px] text-[#59626F] mt-3">
                  {marksData?.rank ? 'Ranked based on total verified marks' : 'Rank will appear after evaluation'}
                </div>
              </div>

              {/* Card 3: Qualification Status */}
              <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-4 sm:p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#59626F] uppercase tracking-wider">
                    Current Status
                  </div>
                  <div className="text-sm sm:text-[15px] font-bold text-[#1B2029] mt-2 leading-snug">
                    {marksData?.qualification_status || 'Registered'}
                  </div>
                </div>
                <div className="mt-3">
                  <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded bg-[#E8F3EC] text-[#1E7A46] border border-[#BEDFCB]">
                    ✓ Official Verification Active
                  </span>
                </div>
              </div>
            </div>

            {/* DETAILED ROUND BREAKDOWN CARDS */}
            <div className="space-y-4">
              {/* ROUND 1: MCQ ASSESSMENT */}
              <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-4 sm:p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#EFECE6]">
                  <div className="flex items-center space-x-2.5">
                    <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#F6F6F2] border border-[#DBD7C9] rounded text-[#16233F]">
                      ROUND 01
                    </span>
                    <h3 className="font-semibold text-sm sm:text-base text-[#1B2029]">
                      Level 1: MCQ Assessment
                    </h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-[#59626F] font-mono">Status:</span>
                    <span className="badge-status badge-completed">
                      {marksData?.mcq_status || 'Submitted'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 items-center">
                  <div>
                    <div className="text-xs text-[#59626F]">Assessed Score</div>
                    <div className="text-xl sm:text-2xl font-bold font-mono text-[#16233F] mt-0.5">
                      {marksData?.mcq_score !== null && marksData?.mcq_score !== undefined
                        ? `${marksData.mcq_score} / 25`
                        : (marksData?.mcq_status?.includes('Directly') ? '25 / 25 (Exempted)' : '— / 25')}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-[#59626F] mb-1 font-mono">
                      <span>Performance Ratio</span>
                      <span>
                        {marksData?.mcq_score !== null && marksData?.mcq_score !== undefined
                          ? `${Math.round(((marksData.mcq_score || 0) / 25) * 100)}%`
                          : '100%'}
                      </span>
                    </div>
                    <div className="w-full bg-[#EFECE6] h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#16233F] h-full rounded-full transition-all"
                        style={{
                          width: `${
                            marksData?.mcq_score !== null && marksData?.mcq_score !== undefined
                              ? Math.min(((marksData.mcq_score || 0) / 25) * 100, 100)
                              : 100
                          }%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ROUND 2: DEBUGGING ASSESSMENT (ONLY SHOWN IF QUALIFIED / UNLOCKED) */}
              {isL2Unlocked && (
                <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-4 sm:p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#EFECE6]">
                    <div className="flex items-center space-x-2.5">
                      <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#F6F6F2] border border-[#DBD7C9] rounded text-[#16233F]">
                        ROUND 02
                      </span>
                      <h3 className="font-semibold text-sm sm:text-base text-[#1B2029]">
                        Level 2: Debugging Challenge
                      </h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-[#59626F] font-mono">Status:</span>
                      <span className={`badge-status ${
                        marksData?.coding_status === 'Completed' ? 'badge-completed' : 'badge-available'
                      }`}>
                        {marksData?.coding_status || 'In Progress'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 items-center">
                    <div>
                      <div className="text-xs text-[#59626F]">Assessed Score (Max 45 Marks)</div>
                      <div className="text-xl sm:text-2xl font-bold font-mono text-[#16233F] mt-0.5">
                        {marksData?.coding_score !== null && marksData?.coding_score !== undefined
                          ? `${marksData.coding_score} / 45`
                          : '— / 45'}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[#59626F] mb-1 font-mono">
                        <span>Performance Ratio</span>
                        <span>
                          {marksData?.coding_score !== null && marksData?.coding_score !== undefined
                            ? `${Math.round(((marksData.coding_score || 0) / 45) * 100)}%`
                            : '0%'}
                        </span>
                      </div>
                      <div className="w-full bg-[#EFECE6] h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#16233F] h-full rounded-full transition-all"
                          style={{
                            width: `${
                              marksData?.coding_score !== null && marksData?.coding_score !== undefined
                                ? Math.min(((marksData.coding_score || 0) / 45) * 100, 100)
                                : 0
                            }%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* TOTAL SUMMARY BANNER */}
            <div className="mt-6 bg-[#16233F] text-white rounded-[6px] p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-[#EFECE6] uppercase tracking-wider">
                  Evaluated Rounds Summary
                </div>
                <div className="text-sm sm:text-base font-semibold mt-1">
                  {isL2Unlocked
                    ? 'Level 1 MCQ (25 Marks) + Level 2 Debugging (45 Marks) = 70 Marks Total'
                    : 'Level 1 MCQ Assessment (25 Marks Max)'}
                </div>
              </div>
              <div className="text-right w-full sm:w-auto flex sm:block justify-between items-center border-t sm:border-t-0 border-[#2D3A5D] pt-2 sm:pt-0">
                <span className="text-xs text-[#DBD7C9] block sm:inline">Your Total:</span>
                <span className="text-2xl font-bold font-mono text-[#3FB950] ml-2">
                  {marksData?.total_score ?? 0} / {maxTotal}
                </span>
              </div>
            </div>

            {/* THANK YOU LETTER & STUDENT FEEDBACK SECTION */}
            <div className="mt-8 bg-white border border-[#DBD7C9] rounded-[6px] p-6 sm:p-8 shadow-sm">
              <div className="flex items-center space-x-2.5 pb-4 border-b border-[#EFECE6] mb-5">
                <span className="text-2xl">📜</span>
                <div>
                  <h3 className="font-serif text-[18px] sm:text-[20px] font-bold text-[#1B2029]">
                    A Message of Thanks &amp; Appreciation
                  </h3>
                  <div className="text-xs text-[#59626F] font-mono mt-0.5">
                    From Department of CSE (AI &amp; ML), RGMCET
                  </div>
                </div>
              </div>

              {/* Appreciation Letter Body */}
              <div className="space-y-3.5 text-xs sm:text-sm text-[#1B2029] leading-relaxed font-sans">
                <p>
                  Dear <strong className="font-semibold text-[#16233F]">{participantName}</strong>,
                </p>
                <p>
                  Thank you for your active participation in <strong>CodeFest 2026</strong>! Your hard work, dedication, and technical spirit throughout the assessment rounds represent the core values of our academic community.
                </p>
                <p>
                  Every challenge attempted and problem tackled is an important step forward in your engineering journey. The Department of CSE (AI &amp; ML) extends its warmest congratulations and appreciation to you.
                </p>
                <div className="bg-[#F9F8F5] border border-[#DBD7C9] rounded p-3.5 text-xs sm:text-sm italic text-[#59626F] leading-relaxed">
                  "Success is not final, failure is not fatal: it is the courage to continue that counts." — Keep coding, building, and aiming high!
                </div>
              </div>

              {/* Signature Block */}
              <div className="mt-6 pt-4 border-t border-[#EFECE6] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-xs sm:text-sm text-[#1B2029]">
                    Organizing Committee &amp; Faculty
                  </div>
                  <div className="text-xs text-[#59626F]">
                    Department of CSE (AI &amp; ML) · RGMCET, Nandyal
                  </div>
                </div>

                <div className="text-xs text-[#8B93A0] font-mono">
                  CodeFest 2026 Official Event
                </div>
              </div>

              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
