import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';
import type { DashboardState } from '../types/auth';

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
    r2: { status: 'Locked', sub: 'Shortlisted candidates will be notified via email or official group' },
    r3: { status: 'Locked', sub: 'Shortlisted candidates will be notified via email or official group' },
    panel: {
      type: 'default',
      title: 'Assessment submitted',
      message: 'Your responses have been recorded. Shortlisted candidates will be notified regarding qualification and next steps via registered email or the official group.'
    }
  },
  'WAITING_FOR_LEVEL2': {
    r1: { status: 'Completed', sub: 'Assessment submitted · Qualified for Level 2' },
    r2: { status: 'Qualified', sub: 'Qualified for Level 2 · Round 2 will open shortly' },
    r3: { status: 'Locked', sub: 'Evaluated manually' },
    panel: {
      type: 'success',
      title: 'Qualified for Level 2',
      message: 'You have qualified for Level 2 (Debugging Challenge). Please wait for the organizers to open the round to begin.'
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
  const [loading, setLoading] = useState<boolean>(true);

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

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10000);
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

  return (
    <div className="min-h-screen bg-[#F6F6F2] pb-24">
      <div className="max-w-[880px] mx-auto pt-10 px-4 sm:px-6">

        {/* TOPBAR */}
        <div className="flex items-center justify-between pb-6 border-b border-[#DBD7C9]">
          <div>
            <div className="text-[11.5px] font-bold tracking-[0.08em] text-[#59626F] uppercase">
              CSE (AI &amp; ML)
            </div>
            <div className="font-serif text-[18px] font-bold text-[#1B2029] leading-tight">
              CodeFest 2026
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-[13.5px] text-[#59626F]">
              Signed in as <strong className="font-semibold text-[#1B2029]">{participantName}</strong>
            </span>
            <button
              onClick={() => logout()}
              className="btn-ghost"
              type="button"
            >
              Log out
            </button>
          </div>
        </div>

        {/* CREDENTIAL STRIP */}
        <div className="mt-6 mb-8 bg-white border border-[#DBD7C9] rounded-[6px] grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#DBD7C9]">
          <div className="p-[18px_22px]">
            <div className="text-[12px] font-semibold text-[#59626F] uppercase tracking-[0.04em]">
              Name
            </div>
            <div className="text-[15px] font-semibold text-[#1B2029] mt-0.5 font-sans">
              {participantName}
            </div>
          </div>

          <div className="p-[18px_22px]">
            <div className="text-[12px] font-semibold text-[#59626F] uppercase tracking-[0.04em]">
              Roll number
            </div>
            <div className="text-[14.5px] font-medium text-[#1B2029] mt-0.5 font-mono">
              {rollNumber}
            </div>
          </div>

          <div className="p-[18px_22px]">
            <div className="text-[12px] font-semibold text-[#59626F] uppercase tracking-[0.04em]">
              Academic year
            </div>
            <div className="text-[15px] font-semibold text-[#1B2029] mt-0.5 font-sans">
              {academicYear}
            </div>
          </div>
        </div>

        {/* COMPETITION PROGRESS SECTION */}
        <div>
          <h2 className="font-serif text-[19px] font-bold text-[#1B2029] mb-3.5">
            Competition progress
          </h2>

          <div className="space-y-3">
            {/* ROUND ROW 01 */}
            <div className={`rounded-[6px] p-[18px_20px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 border ${
              backendState?.level1_result?.status_label === 'Directly Qualified'
                ? 'bg-[#FAFAFA] border-[#DBD7C9] opacity-85'
                : 'bg-white border-[#DBD7C9]'
            }`}>
              <div className="flex items-center space-x-3.5">
                <div className="w-[30px] h-[30px] border border-[#C6C1B0] rounded-[3px] flex items-center justify-center font-mono text-[13px] font-semibold text-[#59626F] shrink-0">
                  01
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#1B2029]">
                    MCQ Assessment
                  </div>
                  <div className="text-[12.5px] text-[#59626F] mt-0.5">
                    {backendState?.level1_result?.status_label === 'Directly Qualified'
                      ? 'Directly Qualified by Admin · Level 1 Exempted'
                      : backendState?.level1_result
                      ? 'Assessment Submitted · Shortlisted candidates will be notified via email'
                      : displayConfig.r1.sub}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3 self-end sm:self-center">
                {backendState?.level1_result?.status_label === 'Directly Qualified' ? (
                  <span className="badge-status badge-completed">Directly Qualified</span>
                ) : (
                  renderBadge(displayConfig.r1.status)
                )}
                {displayConfig.r1.action && (backendState?.can_start_level1 || backendState?.can_resume_level1) && (
                  <button
                    onClick={() => {
                      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                      }
                      onStartMCQ?.();
                    }}
                    className="btn-primary h-[36px] px-4 text-[13px] font-semibold flex items-center space-x-1.5"
                    type="button"
                  >
                    <span>{displayConfig.r1.action}</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            </div>

            {/* ROUND ROW 02 */}
            <div className={`rounded-[6px] p-[18px_20px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
              backendState?.can_start_level2 || backendState?.can_resume_level2
                ? 'bg-white border-2 border-[#16233F] shadow-sm'
                : 'bg-white border border-[#DBD7C9]'
            }`}>
              <div className="flex items-center space-x-3.5">
                <div className={`w-[30px] h-[30px] rounded-[3px] flex items-center justify-center font-mono text-[13px] font-semibold shrink-0 ${
                  backendState?.can_start_level2 || backendState?.can_resume_level2
                    ? 'bg-[#16233F] text-white'
                    : 'border border-[#C6C1B0] text-[#59626F]'
                }`}>
                  02
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#1B2029]">
                    Debugging Assessment
                  </div>
                  <div className="text-[12.5px] text-[#59626F] mt-0.5">
                    {backendState?.level2_result
                      ? 'Assessment Submitted · Shortlisted candidates will be notified via email'
                      : backendState?.can_start_level2
                      ? 'Debugging Challenge · 15 Questions · 45 Marks · 60 minutes'
                      : displayConfig.r2.sub}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3 self-end sm:self-center">
                {backendState?.can_start_level2 ? renderBadge('Available') : renderBadge(displayConfig.r2.status)}
                {(backendState?.can_start_level2 || backendState?.can_resume_level2) && (
                  <button
                    onClick={() => {
                      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                      }
                      onStartCoding?.();
                    }}
                    className="btn-primary h-[36px] px-4 text-[13px] font-semibold flex items-center space-x-1.5 shadow-sm"
                    type="button"
                  >
                    <span>{backendState?.can_resume_level2 ? 'Resume' : 'Enter Assessment'}</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            </div>

            {/* ROUND ROW 03 */}
            <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-[18px_20px] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-[30px] h-[30px] border border-[#C6C1B0] rounded-[3px] flex items-center justify-center font-mono text-[13px] font-semibold text-[#59626F] shrink-0">
                  03
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#1B2029]">
                    Presentation &amp; Viva
                  </div>
                  <div className="text-[12.5px] text-[#59626F] mt-0.5">
                    Presentation &amp; Viva · Shortlisted finalists will receive schedule via email
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3 self-end sm:self-center">
                {renderBadge(displayConfig.r3.status)}
              </div>
            </div>
          </div>

          {/* STATUS PANEL */}
          <div
            className={`mt-5 rounded-[6px] p-[18px_22px] border ${
              displayConfig.panel.type === 'warn'
                ? 'bg-[#FBF1DD] border-[#E9D6A3] text-[#8A5A00]'
                : displayConfig.panel.type === 'error'
                ? 'bg-[#FBEAE8] border-[#EFC5BF] text-[#AE2E22]'
                : (displayConfig.panel.type === 'success' || backendState?.state_headline?.includes('Qualified'))
                ? 'bg-[#E8F3EC] border-[#BEDFCB] text-[#1E7A46]'
                : 'bg-white border-[#DBD7C9] text-[#1B2029]'
            }`}
          >
            <div className="text-[14px] font-bold">
              {backendState?.state_headline || displayConfig.panel.title}
            </div>
            <div className={`text-[13px] mt-1 leading-[1.5] ${
              (displayConfig.panel.type === 'default' && !backendState?.state_headline?.includes('Qualified')) ? 'text-[#59626F]' : ''
            }`}>
              {backendState?.state_description || displayConfig.panel.message}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
