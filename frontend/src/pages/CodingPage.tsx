import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { apiFetch, ApiError } from '../api/client';
import { AssessmentHeader } from '../components/AssessmentHeader';
import { useAuth } from '../context/AuthContext';

const STARTER_TEMPLATES: Record<string, string> = {
  python: `def solve(a, b):
    # Write your solution here
    pass
`,
  c: `#include <stdio.h>

int solve(int a, int b) {
    // Write your solution here
    return 0;
}

int main() {
    int a = 0, b = 0;
    if (scanf("%d %d", &a, &b) == 2 || scanf("%d , %d", &a, &b) == 2 || scanf("%d,%d", &a, &b) == 2) {
        printf("%d\\n", solve(a, b));
    }
    return 0;
}
`,
  cpp: `#include <iostream>
#include <sstream>
#include <string>

using namespace std;

int solve(int a, int b) {
    // Write your solution here
    return 0;
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    string s;
    if (getline(cin, s)) {
        for (char &c : s) if (c == ',') c = ' ';
        stringstream ss(s);
        int a = 0, b = 0;
        if (ss >> a >> b) {
            cout << solve(a, b) << "\\n";
        }
    }
    return 0;
}
`,
  java: `import java.util.Scanner;

public class Main {
    public static int solve(int a, int b) {
        // Write your solution here
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextLine()) {
            String line = sc.nextLine().replace(",", " ");
            Scanner numSc = new Scanner(line);
            if (numSc.hasNextInt()) {
                int a = numSc.nextInt();
                int b = numSc.hasNextInt() ? numSc.nextInt() : 0;
                System.out.println(solve(a, b));
            }
        }
    }
}
`,
};

export const CodingPage: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
  const { participant } = useAuth();
  const [attempt, setAttempt] = useState<any>(null);
  const [selectedProblemIndex, setSelectedProblemIndex] = useState(0);
  const [language, setLanguage] = useState<string>('python');
  const [codeCache, setCodeCache] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [runResults, setRunResults] = useState<any>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState<number>(0);
  const [maxViolations, setMaxViolations] = useState<number>(3);
  const [securityToast, setSecurityToast] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);
  const attemptIdRef = useRef<string>('');

  // Test & Evaluation state
  const [activeTab, setActiveTab] = useState<'testcases' | 'custom' | 'submission'>('testcases');
  const [customInput, setCustomInput] = useState<string>('');
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);
  const [activeTestCaseIdx, setActiveTestCaseIdx] = useState<number>(0);

  const [problemScores, setProblemScores] = useState<Record<string, number>>({});
  const [showFinalSubmitModal, setShowFinalSubmitModal] = useState(false);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
  const [_finalResult, setFinalResult] = useState<any>(null);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);

  const autoSubmitRef = useRef(false);

  useEffect(() => {
    fetchAttempt();

    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);

    const timerInterval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          // Auto final-submit when timer hits 0
          if (!autoSubmitRef.current) {
            autoSubmitRef.current = true;
            handleTimerExpiredSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleVisibility = async () => {
      const currentId = attemptIdRef.current;
      if (document.hidden && currentId) {
        try {
          const res = await apiFetch<any>('/security/violation', {
            method: 'POST',
            body: JSON.stringify({
              attempt_type: 'CODING',
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
            window.location.reload();
          } else {
            showToast(`⚠️ SECURITY STRIKE: Tab switch detected! (${res.violation_count} of ${res.max_violations} strikes)`);
          }
        } catch (e) {
          console.error('Coding violation report failed', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    const showToast = (msg: string) => {
      setSecurityToast(msg);
      setTimeout(() => setSecurityToast(null), 3500);
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    // Strict Anti-Cheat: Disable Copy, Cut, Paste, Context Menu, and Keyboard Shortcuts
    const preventCopyOrPaste = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.getAttribute('data-allow-paste') === 'true') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      showToast('🚫 Action Blocked: Copy & Paste is strictly disabled during the assessment.');
    };

    const preventContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'C' || e.key === 'V' || e.key === 'X')) {
        const target = e.target as HTMLElement;
        if (target && target.getAttribute('data-allow-paste') === 'true') {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        showToast('🚫 Action Blocked: Clipboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+X) are disabled.');
      }
    };

    window.addEventListener('copy', preventCopyOrPaste, true);
    window.addEventListener('cut', preventCopyOrPaste, true);
    window.addEventListener('paste', preventCopyOrPaste, true);
    window.addEventListener('contextmenu', preventContextMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearInterval(timerInterval);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('copy', preventCopyOrPaste, true);
      window.removeEventListener('cut', preventCopyOrPaste, true);
      window.removeEventListener('paste', preventCopyOrPaste, true);
      window.removeEventListener('contextmenu', preventContextMenu, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const currentProblem = attempt?.problems?.[selectedProblemIndex];

  const getProblemStarterTemplate = (prob: any, lang: string): string => {
    if (prob?.starter_code) {
      try {
        const parsed = JSON.parse(prob.starter_code);
        if (parsed && typeof parsed === 'object' && parsed[lang]) {
          return parsed[lang];
        }
      } catch {
        // Plain text starter code fallback (if not JSON format, treat as python)
        if (lang === 'python') {
          return prob.starter_code;
        }
      }
    }
    return STARTER_TEMPLATES[lang] || '';
  };

  // Unique key for caching code per participant, problem, and language
  const userKey = participant?.id || attempt?.attempt_id || 'active';
  const currentCodeKey = `user_${userKey}_prob_${selectedProblemIndex}_lang_${language}`;
  const code = codeCache[currentCodeKey] ?? getProblemStarterTemplate(currentProblem, language);

  const setCode = (newCode: string) => {
    setCodeCache((prev) => ({ ...prev, [currentCodeKey]: newCode }));
  };

  const fetchAttempt = async () => {
    try {
      const data = await apiFetch<any>('/coding/attempt');
      // Reset any previous attempt or session code cache if attempt ID changes
      if (attemptIdRef.current && attemptIdRef.current !== data.attempt_id) {
        setCodeCache({});
        setSelectedProblemIndex(0);
        setRunResults(null);
        setSubmitResult(null);
      }
      setAttempt(data);
      attemptIdRef.current = data.attempt_id;
      if (data.remaining_seconds !== undefined) {
        setRemainingSeconds(data.remaining_seconds);
      }
      if (data.violations_count !== undefined) {
        setTabSwitchCount(data.violations_count);
      }
      if (data.best_scores) {
        setProblemScores(data.best_scores);
      }
      if (data.status === 'SUBMITTED' || data.status === 'TERMINATED') {
        setRemainingSeconds(0);
        setShowCompletedModal(true);
      }
      if (data.problems?.[0]?.sample_test_cases?.[0]?.input_data) {
        setCustomInput(data.problems[0].sample_test_cases[0].input_data);
      }
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load Coding assessment. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Gathers the latest code for each problem across Monaco editor state and code cache
  const getLatestProblemCodes = () => {
    return (attempt?.problems || []).map((prob: any, idx: number) => {
      let probCode = (idx === selectedProblemIndex) ? code : '';
      let probLang = (idx === selectedProblemIndex) ? language : 'python';
      if (!probCode || !probCode.trim()) {
        for (const l of ['python', 'c', 'cpp', 'java']) {
          const k = `user_${userKey}_prob_${idx}_lang_${l}`;
          if (codeCache[k] && codeCache[k].trim()) {
            probCode = codeCache[k];
            probLang = l;
            break;
          }
        }
      }
      return {
        problem_id: prob.id,
        language: probLang,
        code: probCode || getProblemStarterTemplate(prob, probLang),
      };
    });
  };

  // Called automatically when the coding timer reaches 0
  const handleTimerExpiredSubmit = async () => {
    const aid = attemptIdRef.current;
    if (!aid) return;
    const problemCodes = getLatestProblemCodes();
    try {
      await apiFetch<any>('/coding/final-submit', {
        method: 'POST',
        body: JSON.stringify({
          attempt_id: aid,
          problem_codes: problemCodes,
        }),
      });
    } catch {
      // Try query param fallback
      try {
        await apiFetch<any>(`/coding/final-submit?attempt_id=${aid}`, {
          method: 'POST',
          body: JSON.stringify({
            attempt_id: aid,
            problem_codes: problemCodes,
          }),
        });
      } catch { /* best effort */ }
    }
    setRemainingSeconds(0);
    setShowCompletedModal(true);
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    const key = `user_${userKey}_prob_${selectedProblemIndex}_lang_${newLang}`;
    if (!codeCache[key]) {
      setCodeCache((prev) => ({ ...prev, [key]: getProblemStarterTemplate(currentProblem, newLang) }));
    }
  };

  const handleProblemChange = (newIdx: number) => {
    setSelectedProblemIndex(newIdx);
    setRunResults(null);
    setSubmitResult(null);
    setActiveTestCaseIdx(0);
    const prob = attempt?.problems?.[newIdx];
    if (prob?.sample_test_cases?.[0]?.input_data) {
      setCustomInput(prob.sample_test_cases[0].input_data);
    }
  };

  // Run against sample test cases
  const handleRunCode = async () => {
    if (!attempt || !currentProblem) return;
    setExecuting(true);
    setActiveTab('testcases');

    try {
      const res = await apiFetch<any>('/coding/run', {
        method: 'POST',
        body: JSON.stringify({
          problem_id: currentProblem.id,
          language,
          code,
        }),
      });
      setRunResults(res);
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Execution failed.';
      setRunResults({
        all_passed: false,
        total_cases: 1,
        passed_cases: 0,
        results: [{
          test_case_id: 'err',
          input_data: 'N/A',
          expected_output: 'N/A',
          actual_output: 'Error',
          passed: false,
          status: 'Runtime Error',
          error_message: msg,
        }]
      });
    } finally {
      setExecuting(false);
    }
  };

  // Run against custom input
  const handleRunCustomInput = async () => {
    if (!attempt || !currentProblem) return;
    setExecuting(true);
    setActiveTab('custom');

    try {
      const res = await apiFetch<any>('/coding/run', {
        method: 'POST',
        body: JSON.stringify({
          problem_id: currentProblem.id,
          language,
          code,
          custom_input: customInput,
        }),
      });
      setRunResults(res);
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Execution failed.';
      setRunResults({
        all_passed: false,
        total_cases: 1,
        passed_cases: 0,
        results: [{
          test_case_id: 'err',
          input_data: customInput,
          expected_output: 'N/A',
          actual_output: 'Error',
          passed: false,
          status: 'Runtime Error',
          error_message: msg,
        }]
      });
    } finally {
      setExecuting(false);
    }
  };

  // Submit solution for authoritative grading
  const handleSubmit = async () => {
    if (!attempt || !currentProblem) return;
    if (!confirm(`Submit solution for "${currentProblem.title}" (${currentProblem.marks} Marks)? This will evaluate against all hidden test cases.`)) return;

    setExecuting(true);
    setActiveTab('submission');

    try {
      const res = await apiFetch<any>('/coding/submit', {
        method: 'POST',
        body: JSON.stringify({
          attempt_id: attempt.attempt_id,
          problem_id: currentProblem.id,
          language,
          code,
        }),
      });
      setSubmitResult(res);
      setProblemScores((prev) => ({
        ...prev,
        [currentProblem.id]: Math.max(prev[currentProblem.id] || 0, res.score),
      }));
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Submission evaluation failed.';
      setSubmitResult({
        submission_id: 'err',
        verdict: 'FAILED',
        score: 0,
        test_cases_passed: 0,
        total_test_cases: 1,
        terminal_output: msg,
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!attempt) return;
    setIsFinalSubmitting(true);
    const problemCodes = getLatestProblemCodes();
    try {
      const res = await apiFetch<any>('/coding/final-submit', {
        method: 'POST',
        body: JSON.stringify({
          attempt_id: attempt.attempt_id,
          problem_codes: problemCodes,
        }),
      });
      setFinalResult(res);
      setRemainingSeconds(0);
      setShowFinalSubmitModal(false);
      setShowCompletedModal(true);
    } catch (err: any) {
      try {
        const res = await apiFetch<any>(`/coding/final-submit?attempt_id=${attempt.attempt_id}`, {
          method: 'POST',
          body: JSON.stringify({
            attempt_id: attempt.attempt_id,
            problem_codes: problemCodes,
          }),
        });
        setFinalResult(res);
        setRemainingSeconds(0);
        setShowFinalSubmitModal(false);
        setShowCompletedModal(true);
      } catch (fallbackErr: any) {
        // Fallback gracefully so student is never blocked
        setFinalResult({
          total_score: attempt?.problems?.reduce((acc: number, p: any) => acc + (problemScores[p.id] || 0), 0) || 0,
          problem_scores: attempt?.problems?.map((p: any) => ({
            problem_id: p.id,
            best_score: problemScores[p.id] || 0,
          })) || [],
        });
        setRemainingSeconds(0);
        setShowFinalSubmitModal(false);
        setShowCompletedModal(true);
      }
    } finally {
      setIsFinalSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center text-[#59626F] text-sm">
        Initializing coding assessment environment…
      </div>
    );
  }

  if (attempt?.status === 'SUBMITTED' || attempt?.status === 'TERMINATED') {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-6 font-sans text-[#1B2029]">
        <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-lg w-full p-8 text-center space-y-5 shadow-xl">
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
            <p className="text-xs text-[#59626F] mt-1.5 leading-relaxed">
              Your Level 2 coding assessment has been finalized and recorded. You cannot resume or re-enter the live workspace.
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

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-6">
        <div className="bg-white border border-[#DBD7C9] rounded-[6px] p-8 max-w-md text-center">
          <div className="inline-block px-2.5 py-0.5 bg-[#EEF1F6] text-[#16233F] text-[11px] font-mono tracking-wider uppercase rounded-[2px] mb-3">
            Assessment Notice
          </div>
          <h3 className="font-serif text-[20px] font-bold text-[#1B2029] mb-2">
            Coding Assessment Unavailable
          </h3>
          <p className="text-[13px] text-[#59626F] leading-relaxed mb-6">
            {errorMessage}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#F6F6F2] font-sans text-[#1B2029] relative">
      {securityToast && (
        <div className="fixed top-4 inset-x-0 mx-auto w-fit max-w-lg bg-[#AE2E22] text-white px-5 py-3 rounded-[6px] shadow-2xl text-xs font-semibold z-50 flex items-center space-x-2 border border-red-400">
          <span>⚠️</span>
          <span>{securityToast}</span>
        </div>
      )}
      <AssessmentHeader
        roundCode="LEVEL 02"
        roundName="CODING ASSESSMENT"
        remainingSeconds={remainingSeconds}
        rightAction={
          <button
            onClick={() => setShowFinalSubmitModal(true)}
            className="px-3.5 py-1.5 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] transition-colors flex items-center space-x-1.5 shadow-sm"
          >
            <span>✓</span>
            <span>Final Submit</span>
          </button>
        }
      />

      {/* Main Split Layout: Left Problem Statement (38%), Right Monaco + Terminal (62%) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Problem Details & Constraints */}
        <div className="w-[38%] border-r border-[#DBD7C9] bg-white flex flex-col overflow-hidden">
          {/* Problem Selector Bar */}
          <div className="px-4 py-2.5 bg-[#F6F6F2] border-b border-[#DBD7C9] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {attempt?.problems?.map((p: any, idx: number) => {
                const isSelected = selectedProblemIndex === idx;
                const difficultyBadge = idx === 0 ? 'EASY' : 'HARD';
                const scoreForProb = problemScores[p.id] ?? 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProblemChange(idx)}
                    className={`px-3 py-1.5 text-xs font-mono font-semibold rounded-[4px] border transition-all flex items-center space-x-2 ${
                      isSelected
                        ? 'bg-[#16233F] text-white border-[#16233F] shadow-sm'
                        : 'bg-white text-[#59626F] border-[#DBD7C9] hover:border-[#16233F]'
                    }`}
                  >
                    <span>P{idx + 1}</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                      idx === 0
                        ? (isSelected ? 'bg-[#1E7A46] text-white' : 'bg-[#E8F3EC] text-[#1E7A46]')
                        : (isSelected ? 'bg-[#C0392B] text-white' : 'bg-[#FDEDEC] text-[#C0392B]')
                    }`}>
                      {difficultyBadge}
                    </span>
                    {scoreForProb > 0 && (
                      <span className="text-[11px] font-mono font-bold text-[#3FB950]" title="Test cases passed">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center space-x-3 font-mono text-xs">
              {!isFullscreen && (
                <button
                  type="button"
                  onClick={() => {
                    if (document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    }
                  }}
                  className="px-2 py-0.5 bg-[#FFF3CD] text-[#856404] border border-[#FFEEBA] rounded text-[10px] font-bold animate-pulse hover:bg-[#FFE8A1]"
                >
                  ⛶ Enter Fullscreen
                </button>
              )}
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${tabSwitchCount === 0 ? 'bg-[#1E7A46]' : 'bg-[#C0392B]'} animate-pulse`} />
                <span className="text-[#59626F] text-[11px] font-semibold">Tab Strikes:</span>
                <span className={`px-1.5 py-0.5 rounded font-bold text-[11px] ${
                  tabSwitchCount === 0 ? 'bg-[#E8F3EC] text-[#1E7A46]' :
                  tabSwitchCount < 4 ? 'bg-[#FFF3CD] text-[#856404]' : 'bg-[#F8D7DA] text-[#721C24]'
                }`}>
                  {tabSwitchCount} / {maxViolations}
                </span>
              </div>
            </div>
          </div>

          {/* Problem Statement Content */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5 text-xs leading-relaxed">
            {currentProblem ? (
              <>
                <div className="border-b border-[#DBD7C9] pb-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-bold uppercase ${
                      selectedProblemIndex === 0 ? 'bg-[#E8F3EC] text-[#1E7A46]' : 'bg-[#FDEDEC] text-[#C0392B]'
                    }`}>
                      {selectedProblemIndex === 0 ? 'EASY' : 'HARD'}
                    </span>
                    <span className="text-[11px] font-mono text-[#8B93A0]">
                      {currentProblem.marks} Marks · {selectedProblemIndex === 0 ? 'Suggested: ~20 mins' : 'Suggested: ~40 mins'}
                    </span>
                  </div>
                  <h2 className="font-serif text-[20px] font-bold text-[#1B2029]">
                    P{currentProblem.order_num}. {currentProblem.title}
                  </h2>
                </div>

                {/* Problem Description */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#59626F] mb-1.5 font-mono">
                    Problem Description
                  </h4>
                  <div className="text-[#1B2029] leading-relaxed whitespace-pre-line bg-[#F6F6F2] p-3.5 rounded-[4px] border border-[#DBD7C9]/60">
                    {currentProblem.description}
                  </div>
                </div>

                {/* Constraints */}
                {currentProblem.constraints && (
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#59626F] mb-1.5 font-mono">
                      Constraints &amp; Limits
                    </h4>
                    <pre className="font-mono text-[11.5px] bg-[#F6F6F2] p-3 rounded-[3px] border border-[#DBD7C9] text-[#59626F] overflow-x-auto whitespace-pre-wrap">
                      {currentProblem.constraints}
                    </pre>
                  </div>
                )}

                {/* Sample Test Cases */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#59626F] mb-2 font-mono">
                    Public Sample Test Cases
                  </h4>
                  {currentProblem.sample_test_cases?.map((tc: any, idx: number) => (
                    <div key={tc.id || idx} className="bg-[#F6F6F2] border border-[#DBD7C9] rounded-[4px] p-3 mb-3 space-y-2">
                      <div className="font-mono font-bold text-[#16233F] text-[11px]">
                        Sample #{idx + 1}
                      </div>
                      <div>
                        <span className="text-[10px] text-[#59626F] font-mono uppercase font-bold">Input:</span>
                        <pre className="font-mono text-[12px] bg-white p-2 border border-[#DBD7C9] rounded-[3px] mt-0.5 overflow-x-auto text-[#1B2029]">
                          {tc.input_data}
                        </pre>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#59626F] font-mono uppercase font-bold">Expected Output:</span>
                        <pre className="font-mono text-[12px] bg-white p-2 border border-[#DBD7C9] rounded-[3px] mt-0.5 overflow-x-auto font-bold text-[#1E7A46]">
                          {tc.expected_output}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div>No problem available.</div>
            )}
          </div>
        </div>

        {/* Right Panel: Editor + Interactive Terminal Console */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Editor Header Bar */}
          <div className="px-4 py-2 bg-[#F6F6F2] border-b border-[#DBD7C9] flex items-center justify-between relative z-10">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-[#59626F] font-mono font-bold">Language:</span>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="text-xs border border-[#C6C1B0] rounded-[3px] px-2.5 py-1 bg-white font-mono font-medium text-[#16233F]"
              >
                <option value="python">Python 3 (ID: 71)</option>
                <option value="c">C (GCC 9 / ID: 50)</option>
                <option value="cpp">C++ (G++ 9 / ID: 54)</option>
                <option value="java">Java 13 (ID: 62)</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                disabled={executing}
                onClick={handleRunCode}
                className="px-3.5 py-1.5 bg-white border border-[#16233F] text-[#16233F] text-xs font-semibold rounded-[3px] hover:bg-[#EEF1F6] disabled:opacity-50 transition-colors flex items-center space-x-1"
              >
                <span>▶</span>
                <span>{executing ? 'Executing…' : 'Run Code'}</span>
              </button>
              <button
                disabled={executing}
                onClick={handleSubmit}
                className="px-4 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] hover:bg-[#25355B] disabled:opacity-50 transition-colors flex items-center space-x-1.5 shadow-sm relative z-50"
              >
                <span>Submit Solution</span>
                <span>→</span>
              </button>
              <button
                disabled={executing}
                onClick={() => setShowFinalSubmitModal(true)}
                className="px-3.5 py-1.5 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] transition-colors flex items-center space-x-1 shadow-sm ml-2"
              >
                <span>✓ Final Submit</span>
              </button>
            </div>
          </div>

          {/* Monaco Editor Container */}
          {/* Monaco Editor Container */}
          <div className={`overflow-hidden transition-all ${isPanelExpanded ? 'h-0 hidden' : 'flex-1'}`}>
            <Editor
              key={`monaco_${userKey}_${selectedProblemIndex}_${language}`}
              path={`model_${userKey}_${selectedProblemIndex}_${language}`}
              height="100%"
              language={language === 'c' || language === 'cpp' ? 'cpp' : language}
              value={code}
              onChange={(val) => setCode(val || '')}
              theme="vs-light"
              options={{
                fontSize: 13,
                fontFamily: "'IBM Plex Mono', monospace",
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                contextmenu: false,
                copyWithSyntaxHighlighting: false,
              }}
            />
          </div>

          {/* Clean Test Evaluation & Results Panel (No Terminal) */}
          <div className={`border-t border-[#DBD7C9] bg-white flex flex-col font-sans text-xs transition-all duration-200 ${
            isPanelExpanded ? 'flex-1 h-full' : 'h-[250px]'
          }`}>
            {/* Panel Tab Navigation Bar */}
            <div className="bg-[#F6F6F2] border-b border-[#DBD7C9] px-4 py-1.5 flex items-center justify-between select-none">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => setActiveTab('testcases')}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-[3px] transition-colors flex items-center space-x-1.5 ${
                    activeTab === 'testcases'
                      ? 'bg-[#16233F] text-white'
                      : 'text-[#59626F] hover:bg-[#EEF1F6] hover:text-[#1B2029]'
                  }`}
                >
                  <span>Sample Test Cases</span>
                  {runResults && (
                    <span className={`w-2 h-2 rounded-full ${runResults.all_passed ? 'bg-[#1E7A46]' : 'bg-[#C0392B]'}`} />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('custom')}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-[3px] transition-colors ${
                    activeTab === 'custom'
                      ? 'bg-[#16233F] text-white'
                      : 'text-[#59626F] hover:bg-[#EEF1F6] hover:text-[#1B2029]'
                  }`}
                >
                  Custom Testcase
                </button>
                {submitResult && (
                  <button
                    onClick={() => setActiveTab('submission')}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-[3px] transition-colors flex items-center space-x-1.5 ${
                      activeTab === 'submission'
                        ? 'bg-[#16233F] text-white'
                        : 'text-[#59626F] hover:bg-[#EEF1F6] hover:text-[#1B2029]'
                    }`}
                  >
                    <span>Submission Result</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold font-mono ${
                      submitResult.verdict === 'ACCEPTED' ? 'bg-[#E8F3EC] text-[#1E7A46]' : 'bg-[#FDEDEC] text-[#C0392B]'
                    }`}>
                      {submitResult.score}/{currentProblem?.marks}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2 text-[#59626F]">
                <button
                  onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                  className="hover:text-[#1B2029] text-[11px] px-2 py-0.5 rounded hover:bg-[#EEF1F6] font-mono"
                  title={isPanelExpanded ? "Restore Editor View" : "Maximize Panel"}
                >
                  {isPanelExpanded ? '↙ Minimize' : '↗ Maximize'}
                </button>
              </div>
            </div>

            {/* Panel Tab Contents */}
            <div className="flex-1 p-4 overflow-y-auto text-xs leading-relaxed bg-[#FAFAF8]">
              {/* TAB 1: Structured Test Results */}
              {activeTab === 'testcases' && (
                <div className="space-y-3">
                  {runResults ? (
                    <>
                      <div className="flex items-center justify-between border-b border-[#DBD7C9] pb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                            runResults.all_passed ? 'bg-[#E8F3EC] text-[#1E7A46]' : 'bg-[#FDEDEC] text-[#C0392B]'
                          }`}>
                            {runResults.all_passed ? '✓ ALL SAMPLE TESTS PASSED' : '✗ SAMPLE TESTS FAILED'}
                          </span>
                          <span className="text-[#59626F] text-xs font-mono font-semibold">
                            {runResults.passed_cases} / {runResults.total_cases} Passed
                          </span>
                        </div>
                      </div>

                      {/* Test Case Selectors */}
                      <div className="flex space-x-2">
                        {runResults.results?.map((res: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setActiveTestCaseIdx(idx)}
                            className={`px-3 py-1 rounded text-xs font-mono flex items-center space-x-1.5 border transition-all ${
                              activeTestCaseIdx === idx
                                ? 'bg-white text-[#16233F] font-bold border-[#16233F] shadow-sm'
                                : 'bg-[#F6F6F2] text-[#59626F] border-[#DBD7C9] hover:border-[#16233F]'
                            }`}
                          >
                            <span>Case {idx + 1}</span>
                            <span className={`font-bold ${res.passed ? 'text-[#1E7A46]' : 'text-[#C0392B]'}`}>
                              {res.passed ? '✓' : '✗'}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Active Test Case Detail */}
                      {runResults.results?.[activeTestCaseIdx] && (
                        <div className="bg-white p-3.5 rounded-[4px] border border-[#DBD7C9] space-y-3 text-xs">
                          <div>
                            <span className="text-[#59626F] font-mono font-semibold block mb-1">Input:</span>
                            <pre className="bg-[#F6F6F2] p-2 rounded-[3px] text-[#1B2029] font-mono text-[12px] border border-[#DBD7C9]/60 overflow-x-auto">
                              {runResults.results[activeTestCaseIdx].input_data}
                            </pre>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <span className="text-[#59626F] font-mono font-semibold block mb-1">Expected Output:</span>
                              <pre className="bg-[#E8F3EC] p-2 rounded-[3px] text-[#1E7A46] font-mono text-[12px] font-bold border border-[#BEDFCB] overflow-x-auto">
                                {runResults.results[activeTestCaseIdx].expected_output}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[#59626F] font-mono font-semibold block mb-1">Your Output:</span>
                              <pre className={`p-2 rounded-[3px] font-mono text-[12px] font-bold border overflow-x-auto ${
                                runResults.results[activeTestCaseIdx].passed
                                  ? 'bg-[#E8F3EC] text-[#1E7A46] border-[#BEDFCB]'
                                  : 'bg-[#FDEDEC] text-[#C0392B] border-[#F5C2C7]'
                              }`}>
                                {runResults.results[activeTestCaseIdx].actual_output || '(no output)'}
                              </pre>
                            </div>
                          </div>
                          {runResults.results[activeTestCaseIdx].error_message && (
                            <div>
                              <span className="text-[#C0392B] font-mono font-semibold block mb-1">Error Details:</span>
                              <pre className="bg-[#FDEDEC] p-2.5 rounded-[3px] text-[#C0392B] font-mono text-[11px] border border-[#F5C2C7] overflow-x-auto whitespace-pre-wrap">
                                {runResults.results[activeTestCaseIdx].error_message}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[#59626F] italic text-center py-8">
                      Click <strong className="text-[#16233F]">"Run Code"</strong> above to test your solution against public sample test cases.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Custom Input */}
              {activeTab === 'custom' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#59626F] font-semibold">
                      Custom Test Input (stdin arguments):
                    </span>
                    <button
                      disabled={executing}
                      onClick={handleRunCustomInput}
                      className="px-3 py-1 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] disabled:opacity-50 transition-colors flex items-center space-x-1 shadow-sm"
                    >
                      <span>{executing ? 'Executing…' : '▶ Run Custom Input'}</span>
                    </button>
                  </div>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    rows={4}
                    data-allow-paste="true"
                    placeholder="Enter custom input arguments here..."
                    className="w-full bg-white border border-[#DBD7C9] rounded-[4px] p-2.5 text-[#1B2029] font-mono text-xs focus:outline-none focus:border-[#16233F]"
                  />
                  {runResults && (
                    <div className="bg-white p-3 rounded-[4px] border border-[#DBD7C9] text-xs space-y-1">
                      <span className="text-[#59626F] font-mono font-semibold block">Execution Output:</span>
                      <pre className="bg-[#F6F6F2] p-2 rounded-[3px] font-mono text-[12px] text-[#1B2029] overflow-x-auto border border-[#DBD7C9]/60">
                        {runResults.results?.[0]?.actual_output || '(no output)'}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Submission Summary */}
              {activeTab === 'submission' && submitResult && (
                <div className="p-4 bg-white border border-[#DBD7C9] rounded-[4px] space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#DBD7C9] pb-3">
                    <div>
                      <div className={`text-base font-bold font-mono ${
                        submitResult.verdict === 'ACCEPTED' ? 'text-[#1E7A46]' : 'text-[#C0392B]'
                      }`}>
                        {submitResult.verdict === 'ACCEPTED' ? '✓ ACCEPTED' : `✗ ${submitResult.verdict}`}
                      </div>
                      <div className="text-xs text-[#59626F] mt-0.5">
                        Problem: {currentProblem?.title} · Status: {submitResult.status}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold text-[#1E7A46] font-mono">
                        {submitResult.test_cases_passed} of {submitResult.total_test_cases} Test Cases Passed
                      </div>
                      <div className="text-xs text-[#59626F] font-mono">
                        Status: Evaluated
                      </div>
                    </div>
                  </div>

                  {/* Test Cases Breakdown: Shows public vs hidden test cases WITHOUT leaking hidden input or output */}
                  {submitResult.test_cases && submitResult.test_cases.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[#DBD7C9]/60">
                      <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#59626F]">
                        Test Cases Evaluation Breakdown:
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {submitResult.test_cases.map((tc: any) => (
                          <div
                            key={tc.order_num}
                            className={`p-2.5 rounded-[4px] border flex items-center justify-between text-xs font-mono ${
                              tc.passed
                                ? 'bg-[#E8F3EC] border-[#BEDFCB] text-[#1E7A46]'
                                : 'bg-[#FDEDEC] border-[#F5C2C7] text-[#C0392B]'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm">
                                {tc.passed ? '✓' : '✗'}
                              </span>
                              <span className="font-semibold text-[#1B2029]">
                                Case #{tc.order_num} ({tc.is_hidden ? 'Hidden Test Case' : 'Public Sample Case'})
                              </span>
                              {tc.is_hidden && (
                                <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-black/5 text-[#59626F] font-sans font-medium">
                                  🔒 Hidden Case
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-3 text-[11.5px]">
                              <span className="font-bold">{tc.status}</span>
                              <span className="text-[#59626F]">{tc.execution_time_ms}ms</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[11px] text-[#59626F] italic mt-1">
                        🔒 Note: Hidden test case inputs and expected outputs remain sealed to protect competition integrity.
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-[#59626F] pt-1">
                    Your solution for this problem has been evaluated against the test suite.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Final Submit Level 2 */}
      {showFinalSubmitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#DBD7C9] pb-3">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#1E7E34] font-bold">
                Level 02 · Final Submission
              </div>
              <h3 className="font-serif text-[22px] font-bold text-[#1B2029] mt-0.5">
                Complete Coding Assessment?
              </h3>
            </div>

            <div className="space-y-3 bg-[#F6F6F2] p-4 rounded-[4px] border border-[#DBD7C9]/70 text-xs">
              <div className="font-semibold text-[#16233F] text-sm">
                Ready to finalize your assessment?
              </div>
              <p className="text-[#59626F] leading-relaxed">
                Submitting now will finalize your Level 2 Coding Assessment attempt and lock your solutions. You will not be able to return or make further edits.
              </p>
              <div className="flex items-start space-x-2 pt-1 text-[#8A5A00]">
                <span>⚠️</span>
                <span>Make sure you have tested and submitted your solutions for all problems before confirming.</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isFinalSubmitting}
                onClick={() => setShowFinalSubmitModal(false)}
                className="px-4 py-2 bg-white border border-[#DBD7C9] text-[#59626F] text-xs font-semibold rounded-[3px] hover:bg-[#F6F6F2]"
              >
                Return to Editor
              </button>
              <button
                type="button"
                disabled={isFinalSubmitting}
                onClick={handleFinalSubmit}
                className="px-5 py-2 bg-[#1E7E34] text-white text-xs font-bold rounded-[3px] hover:bg-[#166027] disabled:opacity-50 transition-colors flex items-center space-x-2"
              >
                {isFinalSubmitting ? (
                  <span>Finalizing…</span>
                ) : (
                  <span>Confirm &amp; Final Submit →</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Success Modal */}
      {showCompletedModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DBD7C9] rounded-[6px] max-w-md w-full p-8 text-center space-y-5 shadow-2xl">
            <div className="w-14 h-14 bg-[#E8F3EC] text-[#1E7A46] rounded-full flex items-center justify-center mx-auto text-2xl font-bold border border-[#BEDFCB]">
              ✓
            </div>
            
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#1E7A46] font-bold">
                Assessment Completed
              </div>
              <h3 className="font-serif text-[24px] font-bold text-[#1B2029] mt-1">
                Level 02 Submitted Successfully!
              </h3>
              <p className="text-xs text-[#59626F] mt-1 leading-relaxed">
                Your coding solutions have been securely finalized and recorded.
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

            <button
              type="button"
              onClick={() => {
                if (onComplete) {
                  onComplete();
                } else {
                  window.location.href = '/dashboard';
                }
              }}
              className="w-full py-3 bg-[#16233F] text-white text-xs font-bold rounded-[3px] hover:bg-[#25355B] transition-colors shadow-sm"
            >
              Return to Dashboard →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
