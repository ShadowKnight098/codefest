import React, { useState, useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '../api/client';
import { AssessmentHeader } from '../components/AssessmentHeader';
import { useAuth } from '../context/AuthContext';

interface L2Question {
  id: string;
  question_id: string;
  position: number;
  language: string;
  difficulty: string;
  question: string;
  code: string;
  options: Record<string, string>; // { a: text, b: text, c: text, d: text }
  option_keys: string[]; // ["a", "b", "c", "d"]
  marks: number;
  selected_option?: string | null;
}

interface CodingPageProps {
  onComplete?: () => void;
}

export const CodingPage: React.FC<CodingPageProps> = ({ onComplete }) => {
  const { participant } = useAuth();
  const [questions, setQuestions] = useState<L2Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [attemptId, setAttemptId] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);
  const [loading, setLoading] = useState<boolean>(true);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [maxViolations, setMaxViolations] = useState<number>(5);
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<{
    total_score: number;
    total_marks: number;
    answered_count: number;
    total_questions: number;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  const attemptIdRef = useRef<string>('');
  const autoSubmitRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastViolationTimeRef = useRef<number>(0);

  const showToast = (msg: string) => {
    setSecurityToast(msg);
    setTimeout(() => setSecurityToast(null), 4000);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // 1. Initial Attempt Fetch & Countdown Setup
  useEffect(() => {
    // Immediate client-side eligibility check for UX
    if (participant && (participant.academic_year === 1 || participant.academic_year === 4)) {
      setErrorMessage("Level 2 (Debugging Challenge) is open exclusively to Academic Years 2 and 3. You are not eligible for this level.");
      setLoading(false);
      return;
    }

    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);

    let timerInterval: number | null = null;

    const loadAttempt = async () => {
      try {
        const data = await apiFetch<any>('/coding/attempt');
        setAttemptId(data.attempt_id);
        attemptIdRef.current = data.attempt_id;
        setQuestions(data.questions || []);
        setRemainingSeconds(data.remaining_seconds);
        if (data.violations_count !== undefined) {
          setTabSwitchCount(data.violations_count);
        }

        const isAlreadySubmitted = data.status === 'SUBMITTED' || data.status === 'TERMINATED' || data.remaining_seconds <= 0;
        if (isAlreadySubmitted) {
          autoSubmitRef.current = true;
          setSubmitResult({
            total_score: 0,
            total_marks: data.questions?.reduce((acc: number, q: any) => acc + (q.marks || 1), 0) || 45,
            answered_count: data.answered_count || 0,
            total_questions: data.total_questions || data.questions?.length || 15,
          });
        } else {
          // Start timer only if assessment is strictly in progress and active
          timerInterval = window.setInterval(() => {
            setRemainingSeconds((prev) => {
              if (prev <= 1) {
                if (!autoSubmitRef.current) {
                  autoSubmitRef.current = true;
                  handleFinalSubmit();
                }
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
        setLoading(false);
      } catch (err: any) {
        console.error('Failed to load Level 2 attempt:', err);
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage(err?.detail || err?.message || 'Unable to load Level 2 assessment.');
        }
        setLoading(false);
      }
    };

    loadAttempt();

    // Universal Proctoring: Detect Tab switches, App switches (Alt+Tab/Win key/Window blur), and Fullscreen exits
    const triggerSecurityViolation = async (eventType: string, reason: string) => {
      const currentId = attemptIdRef.current;
      if (!currentId || autoSubmitRef.current) return;

      // Debounce violations by 1.5s to avoid duplicate strikes when both blur and visibilitychange fire together
      const now = Date.now();
      if (now - lastViolationTimeRef.current < 1500) {
        return;
      }
      lastViolationTimeRef.current = now;

      try {
        const res = await apiFetch<any>('/security/violation', {
          method: 'POST',
          body: JSON.stringify({
            attempt_type: 'CODING',
            attempt_id: currentId,
            idempotency_key: `${currentId}-${now}`,
            event_type: eventType,
          }),
        });
        if (res.violation_count !== undefined) {
          setTabSwitchCount(res.violation_count);
        }
        if (res.max_violations) {
          setMaxViolations(res.max_violations);
        }
        if (res.terminated) {
          window.location.href = '/terminated';
        } else {
          showToast(
            `Security Alert: ${reason}! (${res.violation_count}/${res.max_violations || 5} strikes). Assessment will terminate on the 5th strike.`
          );
        }
      } catch (e) {
        console.error('Failed to report tab switch violation:', e);
      }
    };

    // 1. Tab hidden or browser minimized
    const handleVisibility = () => {
      if (document.hidden) {
        triggerSecurityViolation('TAB_HIDDEN', 'Tab switch or window minimize detected');
      }
    };

    // 2. Switched to any other application (Alt+Tab, clicking outside, opening Discord/WhatsApp/VS Code)
    const handleWindowBlur = () => {
      triggerSecurityViolation('WINDOW_BLUR', 'Focus lost: switched to another app or window');
    };

    // 3. Exited fullscreen mode
    const handleFullscreenViolation = () => {
      const fsActive = !!document.fullscreenElement;
      setIsFullscreen(fsActive);
      if (!fsActive && !autoSubmitRef.current) {
        triggerSecurityViolation('FULLSCREEN_EXIT', 'Fullscreen exited');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenViolation);

    // Strict Anti-Cheat: Disable Copy, Cut, Paste, and Right-Click Context Menu
    const preventCopy = (e: Event) => {
      e.preventDefault();
      showToast('🚫 Action Blocked: Copy & Paste is strictly disabled.');
      return false;
    };
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('copy', preventCopy);
    document.addEventListener('cut', preventCopy);
    document.addEventListener('paste', preventCopy);
    document.addEventListener('contextmenu', preventContextMenu);

    return () => {
      if (timerInterval !== null) clearInterval(timerInterval);
      document.removeEventListener('fullscreenchange', handleFullscreenViolation);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
      document.removeEventListener('paste', preventCopy);
      document.removeEventListener('contextmenu', preventContextMenu);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [participant]);

  // Keyboard shortcuts (1-4 or A-D to select option, ArrowLeft/Right to navigate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'C' || e.key === 'V' || e.key === 'X')) {
        e.preventDefault();
        showToast('🚫 Action Blocked: Clipboard shortcuts are disabled.');
        return;
      }
      if (['1', 'a', 'A'].includes(e.key)) handleSelectOption('a');
      else if (['2', 'b', 'B'].includes(e.key)) handleSelectOption('b');
      else if (['3', 'c', 'C'].includes(e.key)) handleSelectOption('c');
      else if (['4', 'd', 'D'].includes(e.key)) handleSelectOption('d');
      else if (e.key === 'ArrowRight') {
        setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [questions, currentIndex, submitResult]);

  const pendingSaveRef = useRef<{ question_id: string; selected_option: string | null } | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const flushPendingSave = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingSaveRef.current) {
      const payload = pendingSaveRef.current;
      pendingSaveRef.current = null;
      try {
        await apiFetch('/coding/answer', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setAutosaveState('saved');
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
          setAutosaveState('idle');
        }, 2000);
      } catch (err) {
        console.error('Failed to auto-save answer:', err);
        setAutosaveState('error');
      }
    }
  };

  // Auto-save selected option on click (debounced by 300ms)
  const handleSelectOption = (optionKey: string) => {
    if (!currentQ || submitResult) return;

    const optNormalized = optionKey.toLowerCase();
    // Toggle off if already selected, or select new
    const newSelection = currentQ.selected_option === optNormalized ? null : optNormalized;

    // Instant optimistic UI update
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === currentIndex ? { ...q, selected_option: newSelection } : q))
    );
    setAutosaveState('saving');

    pendingSaveRef.current = {
      question_id: currentQ.id,
      selected_option: newSelection,
    };

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(async () => {
      await flushPendingSave();
    }, 300);
  };

  // Final submit handler
  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    await flushPendingSave();
    try {
      const res = await apiFetch<any>('/coding/submit', {
        method: 'POST',
        body: JSON.stringify({ attempt_id: attemptId }),
      });
      setSubmitResult({
        total_score: res.total_score,
        total_marks: res.total_marks,
        answered_count: res.answered_count,
        total_questions: res.total_questions,
      });
      setShowSubmitModal(false);
      setRemainingSeconds(0);
    } catch (err: any) {
      console.error('Final submit failed:', err);
      alert(`Submission failed: ${err?.detail || err?.message || 'Server error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Notice / Not Eligible Screen
  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-6 font-sans text-[#1B2029]">
        <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-md w-full p-8 text-center space-y-4 shadow-sm">
          <div className="inline-block px-2.5 py-0.5 bg-[#EEF1F6] text-[#16233F] text-[11px] font-mono tracking-wider uppercase rounded-[2px]">
            Assessment Notice
          </div>
          <h3 className="font-serif text-[20px] font-bold text-[#1B2029]">
            Level 2 Notice
          </h3>
          <p className="text-[13px] text-[#59626F] leading-relaxed">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => {
              if (onComplete) onComplete();
              else window.location.href = '/dashboard';
            }}
            className="w-full py-2.5 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] transition-colors shadow-sm"
          >
            Return to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex flex-col items-center justify-center text-[#59626F] text-sm space-y-3 font-mono">
        <svg className="animate-spin h-6 w-6 text-[#16233F]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>Initializing Level 2 Debugging Assessment…</span>
      </div>
    );
  }

  // Already Completed / Finalized Screen
  if (submitResult) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-6 font-sans text-[#1B2029]">
        <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-md w-full p-8 text-center space-y-5 shadow-xl">
          <div className="w-16 h-16 bg-[#E8F3EC] text-[#1E7A46] rounded-full flex items-center justify-center mx-auto text-3xl font-bold border border-[#BEDFCB]">
            ✓
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#1E7A46] font-bold">
              Assessment Completed
            </div>
            <h3 className="font-serif text-[24px] font-bold text-[#1B2029] mt-1">
              Level 02 Already Submitted
            </h3>
            <p className="text-xs text-[#59626F] mt-2 leading-relaxed">
              Your Level 2 Debugging Challenge has been recorded and finalized.
            </p>
          </div>

          <div className="bg-[#F6F6F2] p-4 rounded-[4px] border border-[#DBD7C9] text-left space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#59626F]">Questions Attempted:</span>
              <strong className="text-[#16233F]">{submitResult.answered_count} / {submitResult.total_questions}</strong>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#59626F]">Status:</span>
              <strong className="text-[#1E7A46]">Finalized &amp; Saved</strong>
            </div>
          </div>

          <div className="bg-[#F6F6F2] p-4 rounded-[4px] border border-[#DBD7C9] text-left">
            <div className="flex items-start space-x-3">
              <span className="text-xl">📢</span>
              <div className="text-xs text-[#1B2029] leading-relaxed">
                <strong className="block text-[#16233F] mb-0.5">Evaluation in Progress:</strong>
                Shortlisted finalists for Level 3 will be announced on the dashboard and main leaderboard.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onComplete) onComplete();
              else window.location.href = '/dashboard';
            }}
            className="w-full py-3 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] transition-colors shadow-sm"
          >
            Return to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const answeredCount = questions.filter((q) => q.selected_option).length;
  const unansweredCount = questions.length - answeredCount;

  // Render code snippet with missing line highlighted
  const renderCodeSnippet = (codeText: string) => {
    if (!codeText) return null;
    const lines = codeText.split('\n');

    return (
      <div className="bg-[#161B22] text-[#E6EDF3] rounded-[6px] border border-[#30363D] overflow-hidden my-4 shadow-inner text-xs font-mono">
        <div className="bg-[#0D1117] px-4 py-2 border-b border-[#30363D] flex items-center justify-between text-[11px] text-[#8B949E]">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56] inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E] inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F] inline-block" />
            <span className="ml-2 font-mono font-semibold uppercase text-[#C9D1D9]">
              {currentQ?.language || 'Code Snippet'}
            </span>
          </div>
          <span className="text-[10.5px] font-mono text-[#8B949E]">Read-Only</span>
        </div>

        <div className="p-4 overflow-x-auto max-h-[380px] leading-relaxed">
          {lines.map((line, idx) => {
            const isMissingLine =
              line.includes('// [ MISSING LINE HERE ]') ||
              line.includes('[ MISSING LINE HERE ]') ||
              line.includes('MISSING LINE') ||
              line.includes('__MISSING_LINE__') ||
              line.includes('/* MISSING */') ||
              line.includes('???');

            if (isMissingLine) {
              return (
                <div
                  key={idx}
                  className="my-1.5 px-3 py-1.5 rounded border border-dashed border-[#F59E0B] bg-[#F59E0B]/15 text-[#FBBF24] font-mono text-xs font-semibold flex items-center space-x-2.5"
                >
                  <span className="text-sm">👉</span>
                  <span>[ MISSING LINE — Choose the correct replacement from the options below ]</span>
                </div>
              );
            }

            return (
              <div key={idx} className="flex hover:bg-[#21262D]/50 px-1 rounded">
                <span className="select-none text-[#484F58] w-8 shrink-0 text-right pr-3 font-mono text-[11px]">
                  {idx + 1}
                </span>
                <span className="whitespace-pre font-mono text-[#C9D1D9]">{line}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F6F6F2] flex flex-col select-none relative font-sans text-[#1B2029]">
      {securityToast && (
        <div className="fixed top-4 inset-x-0 mx-auto w-fit max-w-lg bg-[#AE2E22] text-white px-5 py-3 rounded-[6px] shadow-2xl text-xs font-semibold z-50 flex items-center space-x-2 border border-red-400">
          <span>⚠️</span>
          <span>{securityToast}</span>
        </div>
      )}

      {/* SHARED HEADER */}
      <AssessmentHeader
        roundCode="LEVEL 02"
        roundName="DEBUGGING CHALLENGE"
        remainingSeconds={remainingSeconds}
        showDrawerButton={true}
        onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
        rightAction={
          <div className="flex items-center space-x-2">
            {!isFullscreen && (
              <button
                type="button"
                onClick={() => {
                  if (document.documentElement.requestFullscreen) {
                    document.documentElement.requestFullscreen().catch(() => {});
                  }
                }}
                className="px-2.5 py-1 bg-[#FFF3CD] text-[#856404] border border-[#FFEEBA] rounded text-[11px] font-bold animate-pulse hover:bg-[#FFE8A1]"
              >
                ⛶ Fullscreen
              </button>
            )}
            <button
              onClick={() => setShowSubmitModal(true)}
              className="px-3.5 py-1.5 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] transition-colors shadow-sm"
            >
              Submit Assessment →
            </button>
          </div>
        }
      />

      {/* THREE-COLUMN LAYOUT: Left (Code & Statement: 44%), Center (Options & Nav: 34%), Right (Tracker & Status: 22%) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT COLUMN: Question Statement & Code Snippet (44%) */}
        <div className="w-full lg:w-[44%] xl:w-[45%] bg-white border-b lg:border-b-0 lg:border-r border-[#DBD7C9] p-6 lg:p-8 overflow-y-auto flex flex-col justify-between">
          {currentQ ? (
            <div>
              {/* Question metadata */}
              <div className="flex items-center space-x-2.5 pb-3 mb-4 border-b border-[#DBD7C9]">
                <span className="font-mono text-xs font-bold bg-[#EEF1F6] text-[#16233F] px-2.5 py-1 rounded-[3px]">
                  QUESTION {String(currentIndex + 1).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}
                </span>
                <span className="meta-chip uppercase">
                  {currentQ.language || 'Python'}
                </span>
                <span className={`px-2.5 py-0.5 rounded font-mono text-[11px] font-bold uppercase ${
                  currentQ.difficulty.toLowerCase() === 'easy'
                    ? 'bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF]'
                    : currentQ.difficulty.toLowerCase() === 'hard'
                    ? 'bg-[#FDEDEC] text-[#C0392B] border border-[#F5B7B1]'
                    : 'bg-[#FEF9E7] text-[#B7950B] border border-[#F9E79F]'
                }`}>
                  {currentQ.difficulty} · {currentQ.marks} {currentQ.marks === 1 ? 'Mark' : 'Marks'}
                </span>
              </div>

              {/* Question Prompt / Problem statement */}
              <div className="text-[15px] font-medium text-[#1B2029] leading-relaxed mb-3">
                {currentQ.question}
              </div>

              {/* Code Snippet / Pattern Display */}
              {renderCodeSnippet(currentQ.code)}
            </div>
          ) : null}

          <div className="mt-4 p-3 bg-[#F6F6F2] border border-[#DBD7C9] rounded-[4px] text-[12px] text-[#59626F] leading-relaxed">
            💡 <strong>Code Viewer:</strong> Analyze the snippet above. Select the correct completion or output from the <strong>Center Panel</strong>.
          </div>
        </div>

        {/* CENTER COLUMN: The Options & Navigation (34%) */}
        <div className="w-full lg:w-[34%] xl:w-[33%] bg-[#FAFAFA] border-b lg:border-b-0 lg:border-r border-[#DBD7C9] p-6 lg:p-7 overflow-y-auto flex flex-col justify-between">
          {currentQ ? (
            <div>
              {/* Header with Autosave Status */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#DBD7C9]">
                <div>
                  <div className="text-[11px] font-bold font-mono uppercase tracking-wider text-[#59626F]">
                    Answer Choices
                  </div>
                  <div className="text-[14px] font-bold text-[#16233F]">
                    Select One Option
                  </div>
                </div>

                {/* Inline Autosave Indicator */}
                <div className="h-6 flex items-center text-[12px] font-mono">
                  {autosaveState === 'saving' && (
                    <span className="text-[#8B93A0] flex items-center space-x-1.5">
                      <svg className="animate-spin h-3.5 w-3.5 text-[#59626F]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Saving…</span>
                    </span>
                  )}
                  {autosaveState === 'saved' && (
                    <span className="text-[#1E7A46] font-medium flex items-center space-x-1">
                      <span>✓</span>
                      <span>Saved</span>
                    </span>
                  )}
                  {autosaveState === 'error' && (
                    <span className="text-[#AE2E22] font-medium">
                      ⚠ Retry save
                    </span>
                  )}
                </div>
              </div>

              {/* Prompt subtitle */}
              <div className="text-xs font-semibold text-[#59626F] uppercase tracking-wider mb-3">
                {currentQ.question.toLowerCase().includes('output')
                  ? 'Select the predicted program output:'
                  : currentQ.question.toLowerCase().includes('pattern')
                  ? 'Select the correct pattern logic:'
                  : 'Select the line of code that correctly fills the placeholder:'}
              </div>

              {/* 4 Selectable Option Cards */}
              <div className="space-y-2.5">
                {(currentQ.option_keys || ['a', 'b', 'c', 'd']).map((optKey, idx) => {
                  const optText = currentQ.options?.[optKey] || '';
                  const isSelected = currentQ.selected_option === optKey.toLowerCase();
                  const letterLabel = String.fromCharCode(65 + idx); // A, B, C, D

                  return (
                    <button
                      key={optKey}
                      onClick={() => handleSelectOption(optKey)}
                      className={`w-full text-left p-3.5 rounded-[5px] border transition-all flex items-start group ${
                        isSelected
                          ? 'border-[#16233F] ring-2 ring-[#16233F] bg-white shadow-sm'
                          : 'border-[#DBD7C9] bg-white hover:border-[#16233F]/50 hover:bg-[#FDFDFD]'
                      }`}
                      type="button"
                    >
                      <div
                        className={`w-[22px] h-[22px] rounded-full border flex items-center justify-center mr-3 mt-0.5 shrink-0 transition-colors ${
                          isSelected
                            ? 'border-[#16233F] bg-[#16233F] text-white'
                            : 'border-[#C6C1B0] bg-white group-hover:border-[#16233F]/60'
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="font-mono font-bold text-xs text-[#59626F] mr-2">
                          {letterLabel}.
                        </span>
                        <span className="text-[13.5px] font-mono text-[#1B2029] leading-snug break-words whitespace-pre-wrap">
                          {optText}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Clear Selection Button */}
              {currentQ.selected_option && (
                <div className="text-right mt-2">
                  <button
                    onClick={() => handleSelectOption(currentQ.selected_option!)}
                    className="text-[11.5px] text-[#59626F] hover:text-[#AE2E22] underline font-mono"
                    type="button"
                  >
                    ✕ Clear selection
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* Navigation Controls */}
          <div className="mt-8 pt-5 border-t border-[#DBD7C9]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentIndex === 0}
                className="px-4 py-2 bg-white border border-[#C6C1B0] rounded-[3px] text-xs font-semibold text-[#16233F] hover:bg-[#F6F6F2] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                  className="px-5 py-2 bg-[#16233F] text-white rounded-[3px] text-xs font-semibold hover:bg-[#25355B] transition-colors shadow-sm"
                >
                  Next Question →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className="px-5 py-2 bg-[#1E7E34] text-white rounded-[3px] text-xs font-semibold hover:bg-[#166027] transition-colors shadow-sm"
                >
                  Review &amp; Submit →
                </button>
              )}
            </div>

            <div className="text-[11px] font-mono text-[#8B93A0] text-center mt-3">
              Keyboard: [1-4] or [A-D] to select · [←/→] to navigate
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Question Tracker & Status (22%) */}
        <div className="hidden lg:flex lg:w-[22%] xl:w-[22%] bg-[#F6F6F2] p-5 flex-col justify-between overflow-y-auto">
          <div className="space-y-5">
            {/* Tracker Header */}
            <div>
              <div className="text-[11px] font-bold font-mono tracking-wider text-[#59626F] uppercase">
                QUESTION TRACKER
              </div>
              <div className="font-serif text-[16px] font-bold text-[#1B2029]">
                15 Questions · 45 Marks
              </div>

              {/* 15-Question Grid (5x3) */}
              <div className="grid grid-cols-5 gap-1.5 w-full mt-3">
                {questions.map((q, idx) => {
                  const isAttempted = Boolean(q.selected_option);
                  const isCurrent = idx === currentIndex;

                  let cellClass = 'h-9 rounded-[3px] font-mono text-[12px] font-bold flex items-center justify-center transition-all ';
                  if (isCurrent) {
                    cellClass += 'bg-[#16233F] text-white ring-2 ring-[#16233F] shadow-sm';
                  } else if (isAttempted) {
                    cellClass += 'bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF]';
                  } else {
                    cellClass += 'bg-white text-[#59626F] border border-[#DBD7C9] hover:border-[#16233F]/40';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={cellClass}
                      title={`Q${idx + 1} (${q.difficulty}, ${q.marks}M): ${isAttempted ? 'Answered' : 'Unanswered'}`}
                      type="button"
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-3.5 space-y-1.5 text-[11px] font-mono text-[#59626F] pt-3 border-t border-[#DBD7C9]">
                <div className="flex items-center space-x-2">
                  <div className="w-3.5 h-3.5 rounded-[2px] bg-[#16233F]" />
                  <span>Current Question</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3.5 h-3.5 rounded-[2px] bg-[#E8F3EC] border border-[#A9DFBF]" />
                  <span>Answered</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3.5 h-3.5 rounded-[2px] bg-white border border-[#DBD7C9]" />
                  <span>Unanswered</span>
                </div>
              </div>
            </div>

            {/* Assessment Progress & Marks Breakdown */}
            <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-3.5 space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center pb-1.5 border-b border-[#DBD7C9]">
                <span className="text-[#59626F]">Total Questions:</span>
                <span className="font-bold text-[#16233F]">{questions.length}</span>
              </div>
              <div className="flex justify-between items-center pb-1.5 border-b border-[#DBD7C9]">
                <span className="text-[#59626F]">Answered:</span>
                <span className="font-bold text-[#1E7A46]">{answeredCount} / {questions.length}</span>
              </div>
              <div className="flex justify-between items-center pb-1.5 border-b border-[#DBD7C9]">
                <span className="text-[#59626F]">Unanswered:</span>
                <span className="font-bold text-[#D97706]">{unansweredCount}</span>
              </div>
              <div className="pt-1 text-[11px] text-[#59626F] leading-snug">
                <div>• 5 Easy (1M each = 5M)</div>
                <div>• 5 Medium (3M each = 15M)</div>
                <div>• 5 Hard (5M each = 25M)</div>
                <div className="font-bold text-[#16233F] mt-1">Total: 45 Marks</div>
              </div>
            </div>

            {/* Proctoring Card */}
            <div className="bg-white border border-[#DBD7C9] rounded-[4px] p-3.5 space-y-2">
              <div className="flex items-center space-x-2 font-mono text-[11px] font-bold text-[#16233F]">
                <span className={`w-2.5 h-2.5 rounded-full ${tabSwitchCount === 0 ? 'bg-[#1E7A46]' : 'bg-[#DC2626]'} animate-pulse`} />
                <span>PROCTORING ACTIVE</span>
              </div>
              <div className="pt-1 border-t border-[#DBD7C9] flex justify-between items-center font-mono text-xs">
                <span className="text-[#59626F]">Tab Switches:</span>
                <strong className={
                  tabSwitchCount === 0 ? 'text-[#1E7A46]' :
                  tabSwitchCount < 4 ? 'text-[#D97706]' : 'text-[#DC2626]'
                }>
                  {tabSwitchCount} / {maxViolations} Strikes
                </strong>
              </div>
            </div>

            {/* Assessment Submit Button */}
            <button
              onClick={() => setShowSubmitModal(true)}
              className="w-full py-2.5 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] transition-colors shadow-sm flex items-center justify-center space-x-1.5"
              type="button"
            >
              <span>Submit Assessment</span>
              <span>→</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-[#8B93A0] pt-3">
            Roll: {participant?.roll_number} · Year {participant?.academic_year}
          </div>
        </div>
      </div>

      {/* Mobile / Slide-Over Drawer for Question Tracker */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="relative ml-auto w-4/5 max-w-sm bg-[#F6F6F2] h-full p-5 overflow-y-auto flex flex-col justify-between shadow-2xl z-50">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#DBD7C9]">
                <span className="font-bold text-[#16233F] text-sm">Question Tracker</span>
                <button onClick={() => setDrawerOpen(false)} className="font-bold text-lg p-1 text-[#59626F]">✕</button>
              </div>

              <div className="grid grid-cols-5 gap-2 w-full mt-4">
                {questions.map((q, idx) => {
                  const isAttempted = Boolean(q.selected_option);
                  const isCurrent = idx === currentIndex;
                  return (
                    <button
                      key={q.id}
                      onClick={() => {
                        setCurrentIndex(idx);
                        setDrawerOpen(false);
                      }}
                      className={`h-9 rounded-[3px] font-mono text-xs font-bold flex items-center justify-center ${
                        isCurrent
                          ? 'bg-[#16233F] text-white'
                          : isAttempted
                          ? 'bg-[#E8F3EC] text-[#1E7A46] border border-[#A9DFBF]'
                          : 'bg-white text-[#59626F] border border-[#DBD7C9]'
                      }`}
                      type="button"
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 p-3 bg-white border border-[#DBD7C9] rounded font-mono text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#59626F]">Answered:</span>
                  <strong className="text-[#1E7A46]">{answeredCount} / {questions.length}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#59626F]">Unanswered:</span>
                  <strong className="text-[#D97706]">{unansweredCount}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#59626F]">Total Marks:</span>
                  <strong className="text-[#16233F]">45 Marks</strong>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setDrawerOpen(false);
                setShowSubmitModal(true);
              }}
              className="w-full py-3 bg-[#1E7E34] text-white text-xs font-bold rounded mt-4"
              type="button"
            >
              Submit Assessment →
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[6px] max-w-md w-full p-6 shadow-2xl border border-[#DBD7C9] space-y-4 font-sans">
            <h3 className="font-serif text-lg font-bold text-[#16233F]">
              Submit Level 2 Assessment?
            </h3>
            <p className="text-xs text-[#59626F] leading-relaxed">
              Are you sure you want to finalize your submission? Once submitted, you cannot change your answers.
            </p>

            <div className="p-3 bg-[#F6F6F2] rounded border border-[#DBD7C9] font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#59626F]">Total Questions:</span>
                <strong>{questions.length}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#59626F]">Answered:</span>
                <strong className="text-[#1E7A46]">{answeredCount}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#59626F]">Unanswered:</span>
                <strong className={unansweredCount > 0 ? 'text-[#DC2626]' : 'text-[#59626F]'}>
                  {unansweredCount}
                </strong>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="p-2.5 bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] rounded text-[11.5px]">
                ⚠ You still have <strong>{unansweredCount} unanswered</strong> questions. They will receive 0 marks.
              </div>
            )}

            <div className="flex justify-end space-x-2.5 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 border border-[#C6C1B0] rounded-[3px] text-xs font-semibold text-[#59626F] hover:bg-[#F6F6F2]"
              >
                Continue Assessment
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalSubmit}
                className="px-5 py-2 bg-[#1E7E34] text-white rounded-[3px] text-xs font-semibold hover:bg-[#166027] shadow-sm disabled:opacity-50 flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <span>Submitting…</span>
                ) : (
                  <span>Yes, Submit Now</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
