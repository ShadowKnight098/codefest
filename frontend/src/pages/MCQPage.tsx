import React, { useState, useEffect, useRef } from 'react';
import { AssessmentHeader } from '../components/AssessmentHeader';
import { apiFetch, ApiError } from '../api/client';

interface Question {
  index: number;
  question_id: string;
  topic: string;
  difficulty: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  selected_option?: string | null;
}

interface MCQPageProps {
  onComplete: (isQualified?: boolean) => void;
  onTerminated?: () => void;
}

export const MCQPage: React.FC<MCQPageProps> = ({ onComplete, onTerminated }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [attemptId, setAttemptId] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(1800);
  const [loading, setLoading] = useState<boolean>(true);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [confirmSubmitStep, setConfirmSubmitStep] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<{
    score: number;
    total_marks: number;
    correct_count: number;
    incorrect_count: number;
    unanswered_count: number;
    is_qualified: boolean;
  } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [maxViolations, setMaxViolations] = useState<number>(3);
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);
  const attemptIdRef = useRef<string>('');
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{ attempt_id: string; question_id: string; option: string } | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setSecurityToast(msg);
    setTimeout(() => setSecurityToast(null), 3500);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const flushPendingSave = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingSaveRef.current) {
      const payload = pendingSaveRef.current;
      pendingSaveRef.current = null;
      try {
        await apiFetch('/api/mcq/answer', {
          method: 'POST',
          body: JSON.stringify({
            attempt_id: payload.attempt_id,
            question_id: payload.question_id,
            selected_option: payload.option,
          }),
        });
        setAutosaveState('saved');
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
          setAutosaveState('idle');
        }, 2000);
      } catch (err) {
        console.error('Failed to save answer:', err);
        setAutosaveState('error');
      }
    }
  };

  // 1. Fetch or initialize attempt from backend
  useEffect(() => {
    let timerInterval: number;

    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);

    const loadAttempt = async () => {
      try {
        const data = await apiFetch<any>('/api/mcq/attempt');
        setAttemptId(data.attempt_id);
        attemptIdRef.current = data.attempt_id;
        setQuestions(data.questions);
        setRemainingSeconds(data.remaining_seconds);
        if (data.violations_count !== undefined) {
          setTabSwitchCount(data.violations_count);
        }
        if (data.status === 'SUBMITTED' || data.status === 'TERMINATED') {
          setIsSubmitted(true);
        }
        setLoading(false);

        // Server-synchronized countdown
        timerInterval = window.setInterval(() => {
          setRemainingSeconds((prev) => {
            if (prev <= 1) {
              // Force submit on expiry
              handleFinalSubmit();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } catch (err) {
        console.error('Failed to load MCQ attempt:', err);
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('Unable to load the assessment. Please check your connection and try again.');
        }
        setLoading(false);
      }
    };

    loadAttempt();

    // Visibility change / tab switch proctoring listener
    const handleVisibility = async () => {
      const currentId = attemptIdRef.current;
      if (document.hidden && currentId) {
        try {
          const res = await apiFetch<any>('/security/violation', {
            method: 'POST',
            body: JSON.stringify({
              attempt_type: 'MCQ',
              attempt_id: currentId,
              idempotency_key: `${currentId}-${Date.now()}`,
              event_type: 'TAB_HIDDEN',
            }),
          });
          if (res.violation_count !== undefined) {
            setTabSwitchCount(res.violation_count);
          }
          if (res.max_violations) {
            setMaxViolations(res.max_violations);
          }
          if (res.terminated) {
            alert(res.message);
            onTerminated?.();
          } else {
            showToast(`⚠️ SECURITY STRIKE: Tab switch detected! (${res.violation_count} of ${res.max_violations} strikes)`);
          }
        } catch (e) {
          console.error('Violation report failed', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'C' || e.key === 'V' || e.key === 'X')) {
        e.preventDefault();
        showToast('🚫 Action Blocked: Clipboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+X) are disabled.');
      }
    };

    document.addEventListener('copy', preventCopy);
    document.addEventListener('cut', preventCopy);
    document.addEventListener('paste', preventCopy);
    document.addEventListener('contextmenu', preventContextMenu);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      if (timerInterval) clearInterval(timerInterval);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
      document.removeEventListener('paste', preventCopy);
      document.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [attemptId]);

  const currentQ = questions[currentIndex];

  // 2. Debounced Autosave answer selection
  const handleSelectOption = (option: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQ || isSubmitted) return;

    // 1. Instant optimistic UI update
    const updated = [...questions];
    updated[currentIndex] = { ...currentQ, selected_option: option };
    setQuestions(updated);
    setAutosaveState('saving');

    // 2. Buffer pending payload
    pendingSaveRef.current = {
      attempt_id: attemptId || attemptIdRef.current,
      question_id: currentQ.question_id,
      option,
    };

    // 3. Debounce network dispatch by 400ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(async () => {
      await flushPendingSave();
    }, 400);
  };

  // 3. Navigation (flushes any pending debounced save first)
  const handleNext = async () => {
    await flushPendingSave();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setAutosaveState('idle');
    }
  };

  const handlePrev = async () => {
    await flushPendingSave();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setAutosaveState('idle');
    }
  };

  const handleJumpToQuestion = async (idx: number) => {
    await flushPendingSave();
    setCurrentIndex(idx);
    setShowReviewModal(false);
    setDrawerOpen(false);
    setAutosaveState('idle');
  };

  // 4. Submission
  const handleFinalSubmit = async () => {
    await flushPendingSave();
    setIsSubmitting(true);
    try {
      const res = await apiFetch<any>('/api/mcq/submit', {
        method: 'POST',
        body: JSON.stringify({ attempt_id: attemptId || attemptIdRef.current }),
      });
      setIsSubmitted(true);
      setShowReviewModal(false);
      setSubmitResult({
        score: res.score,
        total_marks: res.total_marks || 25,
        correct_count: res.correct_count ?? res.score,
        incorrect_count: res.incorrect_count ?? (25 - res.score),
        unanswered_count: res.unanswered_count ?? 0,
        is_qualified: res.is_qualified,
      });
    } catch (err) {
      console.error('Failed to submit assessment:', err);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center text-[#59626F] text-[14px]">
        Initializing assessment environment…
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-6">
        <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-8 max-w-md text-center">
          <div className="inline-block px-2.5 py-0.5 bg-[#EEF1F6] text-[#16233F] text-[11px] font-mono tracking-wider uppercase rounded-[2px] mb-3">
            Assessment Notice
          </div>
          <h3 className="font-serif text-[20px] font-bold text-[#1B2029] mb-2">
            Assessment Unavailable
          </h3>
          <p className="text-[13px] text-[#59626F] leading-relaxed mb-6">
            {errorMessage}
          </p>
          <button
            onClick={() => onComplete(false)}
            className="btn-primary h-[42px] px-6 text-[14px] font-semibold"
            type="button"
          >
            Return to Dashboard →
          </button>
        </div>
      </div>
    );
  }
  // Small viewport handling per spec (§2 & §6)
  // Shown below 880px via CSS breakpoint
  const smallViewportNotice = (
    <div className="md:hidden fixed inset-0 z-50 bg-[#F6F6F2] flex items-center justify-center p-6 text-center">
      <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-8 max-w-sm">
        <div className="font-serif text-[18px] font-bold text-[#1B2029] mb-2">
          Larger screen required
        </div>
        <p className="text-[13px] text-[#59626F] leading-relaxed">
          This assessment requires a larger screen. Please continue on a laptop or desktop computer.
        </p>
      </div>
    </div>
  );

  if (isSubmitted && !submitResult) {
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
              Level 01 Already Submitted
            </h3>
            <p className="text-xs text-[#59626F] mt-2 leading-relaxed">
              Your Level 1 MCQ assessment has been finalized and recorded. You cannot resume or re-enter this assessment.
            </p>
          </div>

          <div className="bg-[#F6F6F2] p-4 rounded-[4px] border border-[#DBD7C9] text-left">
            <div className="flex items-start space-x-3">
              <span className="text-xl">📢</span>
              <div className="text-xs text-[#1B2029] leading-relaxed">
                <strong className="block text-[#16233F] mb-0.5">Evaluation in Progress:</strong>
                Shortlisted candidates will be notified regarding qualification and next round schedule via registered email or the official group.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onComplete(false)}
            className="w-full py-3 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] transition-colors shadow-sm"
          >
            Return to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  const answeredCount = questions.filter((q) => q.selected_option).length;
  const remainingCount = questions.length - answeredCount;

  return (
    <div className="min-h-screen bg-[#F6F6F2] flex flex-col select-none relative">
      {smallViewportNotice}

      {securityToast && (
        <div className="fixed top-4 inset-x-0 mx-auto w-fit max-w-lg bg-[#AE2E22] text-white px-5 py-3 rounded-[6px] shadow-2xl text-xs font-semibold z-50 flex items-center space-x-2 border border-red-400">
          <span>⚠️</span>
          <span>{securityToast}</span>
        </div>
      )}

      {/* SHARED HEADER (§1) */}
      <AssessmentHeader
        roundCode="LEVEL 01"
        roundName="MCQ ASSESSMENT"
        remainingSeconds={remainingSeconds}
        showDrawerButton={true}
        onToggleDrawer={() => setDrawerOpen(!drawerOpen)}
        rightAction={
          !isFullscreen ? (
            <button
              type="button"
              onClick={() => {
                if (document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
              }}
              className="px-2.5 py-1 bg-[#FFF3CD] text-[#856404] border border-[#FFEEBA] rounded text-[11px] font-bold animate-pulse hover:bg-[#FFE8A1]"
            >
              ⛶ Enter Fullscreen
            </button>
          ) : undefined
        }
      />

      {/* MAIN THREE-PANEL GRID (22% / 53% / 25%) */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANEL (22%) - Quiet Supporting */}
        <div className="hidden lg:flex w-[22%] bg-[#F6F6F2] border-r border-[#DBD7C9] p-8 flex-col justify-between">
          <div>
            <div className="text-[11.5px] font-bold tracking-[0.08em] text-[#59626F] uppercase">
              CSE (AI &amp; ML)
            </div>
            <div className="font-serif text-[17px] font-bold text-[#1B2029]">
              CodeFest 2026
            </div>

            <div className="mt-6 pt-6 border-t border-[#DBD7C9]">
              <div className="text-[13px] font-semibold text-[#1B2029]">
                Level 1 · MCQ Assessment
              </div>
              <div className="text-[12px] text-[#8B93A0] mt-1 font-mono">
                25 Questions · 30 Mins
              </div>
            </div>

            <div className="mt-6 p-3.5 bg-white border border-[#DBD7C9] rounded-[3px] text-[12px] text-[#59626F] leading-relaxed">
              Answers save automatically as you go. You can revisit any question before submitting.
            </div>
          </div>

          <div className="text-[11.5px] text-[#8B93A0]">
            Proctored session · ID: {attemptId.slice(0, 8)}
          </div>
        </div>

        {/* CENTER PANEL (53%) - Primary Focal Area */}
        <div className="w-full lg:w-[53%] bg-white p-8 sm:p-12 lg:p-14 overflow-y-auto flex flex-col justify-between">
          {currentQ ? (
            <div>
              {/* Question metadata & Autosave status bar */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="font-mono text-[13px] text-[#8B93A0]">
                    QUESTION {String(currentQ.index).padStart(2, '0')}
                  </div>
                  <div className="font-mono text-[13px] text-[#8B93A0] mt-0.5">
                    {String(currentQ.index).padStart(2, '0')} / {String(questions.length).padStart(2, '0')}
                  </div>
                </div>

                {/* Inline Autosave Indicator */}
                <div className="h-6 flex items-center text-[13px]">
                  {autosaveState === 'saving' && (
                    <span className="text-[#8B93A0] flex items-center space-x-1.5 font-mono">
                      <svg className="animate-spin h-3.5 w-3.5 text-[#59626F]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Saving…</span>
                    </span>
                  )}
                  {autosaveState === 'saved' && (
                    <span className="text-[#1E7A46] font-medium transition-opacity">
                      ✓ Answer saved
                    </span>
                  )}
                  {autosaveState === 'error' && (
                    <span className="text-[#AE2E22] font-medium">
                      Unable to save answer. Retrying…
                    </span>
                  )}
                </div>
              </div>

              {/* Question Text */}
              <div className="text-[18px] text-[#1B2029] leading-[1.6] max-w-[640px] mb-8 font-sans font-medium">
                {currentQ.question_text}
              </div>

              {/* Options A, B, C, D */}
              <div className="space-y-3 max-w-[640px]">
                {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                  const optText =
                    opt === 'A' ? currentQ.option_a :
                    opt === 'B' ? currentQ.option_b :
                    opt === 'C' ? currentQ.option_c : currentQ.option_d;

                  const isSelected = currentQ.selected_option === opt;

                  return (
                    <button
                      key={opt}
                      onClick={() => handleSelectOption(opt)}
                      disabled={isSubmitted}
                      className={`option-card group ${isSelected ? 'selected' : ''}`}
                      type="button"
                    >
                      {/* Left edge indicator */}
                      <div
                        className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center mr-3.5 shrink-0 transition-colors ${
                          isSelected
                            ? 'border-[#16233F] bg-[#16233F] text-white'
                            : 'border-[#C6C1B0] bg-white group-hover:border-[#16233F]/40'
                        }`}
                      >
                        {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>

                      <div className="text-[14.5px] text-[#1B2029] leading-snug">
                        <span className="font-mono font-medium text-[#59626F] mr-2">{opt}.</span>
                        {optText}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Live Proctoring & Tab Switch Status Box below MCQ */}
              <div className="mt-8 max-w-[640px] p-4 bg-[#F6F6F2] border border-[#DBD7C9] rounded-[4px] flex items-center justify-between font-mono">
                <div className="flex items-center space-x-3">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${tabSwitchCount === 0 ? 'bg-[#1E7A46]' : 'bg-[#C0392B]'} animate-pulse`} />
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#16233F] flex items-center space-x-2">
                      <span>Proctoring Security Active</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-[#EEF1F6] text-[#59626F] rounded">Round 1</span>
                    </div>
                    <div className="text-[11.5px] text-[#59626F] mt-0.5">
                      Switching browser tabs or minimizing this window is strictly recorded.
                    </div>
                  </div>
                </div>
                <div className="text-right pl-4 border-l border-[#DBD7C9] shrink-0">
                  <div className="text-[10px] uppercase font-bold text-[#8B93A0]">Tab Switches</div>
                  <div className={`text-[14px] font-bold ${
                    tabSwitchCount === 0 ? 'text-[#1E7A46]' :
                    tabSwitchCount < 4 ? 'text-[#D97706]' : 'text-[#DC2626]'
                  }`}>
                    {tabSwitchCount} / {maxViolations} Strikes
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div />
        </div>

        {/* RIGHT PANEL (25%) - Navigator */}
        <div
          className={`fixed inset-y-0 right-0 z-30 lg:static w-[300px] lg:w-[25%] bg-[#F6F6F2] border-l border-[#DBD7C9] p-6 transition-transform duration-200 lg:translate-x-0 ${
            drawerOpen ? 'translate-x-0 shadow-xl' : 'translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="flex items-center justify-between lg:hidden mb-4 pb-2 border-b border-[#DBD7C9]">
            <span className="text-sm font-semibold text-[#1B2029]">Question Navigator</span>
            <button
              onClick={() => setDrawerOpen(false)}
              className="text-xs text-[#59626F] px-2 py-1"
            >
              Close ✕
            </button>
          </div>

          <div className="text-[12px] font-semibold text-[#59626F] uppercase tracking-[0.04em] mb-4">
            Question Navigator
          </div>

          {/* 5x5 Grid */}
          <div className="grid grid-cols-5 gap-2 w-fit">
            {questions.map((q, idx) => {
              const isAttempted = Boolean(q.selected_option);
              const isCurrent = idx === currentIndex;

              return (
                <button
                  key={q.question_id || idx}
                  onClick={() => handleJumpToQuestion(idx)}
                  className={`nav-cell ${
                    isAttempted ? 'attempted' : 'unattempted'
                  } ${isCurrent ? 'current' : ''}`}
                  type="button"
                >
                  {String(idx + 1).padStart(2, '0')}
                </button>
              );
            })}
          </div>

          {/* Progress line */}
          <div className="mt-6 pt-5 border-t border-[#DBD7C9]">
            <div className="text-[14px] font-semibold text-[#1B2029]">
              {answeredCount} / {questions.length} answered
            </div>
            <div className="text-[13px] text-[#8B93A0] mt-0.5 font-mono">
              {remainingCount} remaining
            </div>
          </div>

          {/* Security Strikes Status in Sidebar */}
          <div className="mt-4 pt-4 border-t border-[#DBD7C9]">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="text-[#59626F]">Tab Violations:</span>
              <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                tabSwitchCount === 0 ? 'bg-[#E8F3EC] text-[#1E7A46]' : 'bg-[#FDEDEC] text-[#C0392B]'
              }`}>
                {tabSwitchCount} / {maxViolations} Strikes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="h-[68px] bg-white border-t border-[#DBD7C9] px-6 sm:px-14 flex items-center justify-between sticky bottom-0 z-20">
        <div>
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0 || isSubmitted}
            className="btn-ghost"
            type="button"
          >
            ← Previous
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setShowReviewModal(true);
              setConfirmSubmitStep(false);
            }}
            disabled={isSubmitted}
            className="btn-secondary"
            type="button"
          >
            Review &amp; Submit
          </button>

          {currentIndex < questions.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={isSubmitted}
              className="btn-primary h-[38px] px-5 text-[13px]"
              type="button"
            >
              Save &amp; Next →
            </button>
          ) : (
            <button
              onClick={() => {
                setShowReviewModal(true);
                setConfirmSubmitStep(false);
              }}
              disabled={isSubmitted}
              className="btn-primary h-[38px] px-5 text-[13px]"
              type="button"
            >
              Complete &amp; Review
            </button>
          )}
        </div>
      </div>

      {/* REVIEW & CONFIRM SUBMISSION MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-[480px] w-full p-6 sm:p-7 shadow-lg">
            <h3 className="font-serif text-[20px] font-bold text-[#1B2029]">
              Review your answers
            </h3>

            <div className="flex items-center space-x-6 my-4 text-[14px]">
              <span className="font-semibold text-[#1E7A46]">
                {answeredCount} Answered
              </span>
              <span className={`font-semibold ${remainingCount > 0 ? 'text-[#8A5A00]' : 'text-[#8B93A0]'}`}>
                {remainingCount} Not Answered
              </span>
            </div>

            {/* Quick jump question numbers */}
            <div className="my-5 p-3 bg-[#F6F6F2] border border-[#DBD7C9] rounded-[3px]">
              <div className="text-[11.5px] text-[#59626F] mb-2 font-medium">
                Click any number to review:
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleJumpToQuestion(idx)}
                    className={`h-7 rounded-[3px] text-xs font-mono font-medium border ${
                      q.selected_option
                        ? 'bg-[#E8F3EC] border-[#BEDFCB] text-[#1E7A46]'
                        : 'bg-white border-[#C6C1B0] text-[#59626F]'
                    }`}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            {/* Confirmation step */}
            {confirmSubmitStep ? (
              <div className="p-3 bg-[#FBEAE8] border border-[#EFC5BF] rounded-[3px] mb-5 text-[12.5px] text-[#AE2E22] leading-relaxed">
                This cannot be undone. Once submitted, your answers will be locked and finalized.
              </div>
            ) : null}

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-[#DBD7C9]">
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setConfirmSubmitStep(false);
                }}
                disabled={isSubmitting}
                className="btn-ghost"
                type="button"
              >
                Cancel
              </button>

              {!confirmSubmitStep ? (
                <button
                  onClick={() => setConfirmSubmitStep(true)}
                  className="btn-primary h-[38px] px-4 text-[13px]"
                  type="button"
                >
                  Submit Assessment
                </button>
              ) : (
                <button
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="btn-primary h-[38px] px-4 text-[13px] bg-[#AE2E22] hover:bg-[#8A241A]"
                  type="button"
                >
                  {isSubmitting ? 'Submitting…' : 'Confirm Submission'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POST-SUBMISSION CONFIRMATION MODAL */}
      {submitResult && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-[460px] w-full p-6 sm:p-8 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-[#E8F3EC] text-[#1E7A46] rounded-full flex items-center justify-center mx-auto text-2xl font-bold border border-[#BEDFCB]">
              ✓
            </div>

            <div>
              <div className="inline-block px-2.5 py-0.5 bg-[#EEF1F6] text-[#16233F] text-[11px] font-mono tracking-wider uppercase rounded-[2px] mb-2">
                Level 01 Complete
              </div>

              <h3 className="font-serif text-[24px] font-bold text-[#1B2029]">
                Assessment Submitted Successfully
              </h3>

              <p className="text-[13px] text-[#59626F] mt-2 leading-relaxed">
                Your responses for Level 1 (MCQ Assessment) have been securely recorded.
              </p>
            </div>

            {/* Email / Group Notification Notice Card */}
            <div className="p-4 rounded-[4px] border bg-[#F6F6F2] border-[#DBD7C9] text-left">
              <div className="flex items-start space-x-3">
                <span className="text-xl">📢</span>
                <div className="text-xs text-[#1B2029] leading-relaxed">
                  <strong className="block text-[#16233F] mb-0.5">Evaluation in Progress:</strong>
                  Shortlisted candidates will be notified regarding qualification and next round schedule via registered email or the official group.
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={() => onComplete(false)}
              className="w-full btn-primary h-[42px] text-[14px] font-semibold flex items-center justify-center space-x-2"
              type="button"
            >
              <span>Return to Dashboard →</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
