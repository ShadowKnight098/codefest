import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { apiFetch, ApiError } from '../api/client';
import { AssessmentHeader } from '../components/AssessmentHeader';

const STARTER_TEMPLATES: Record<string, string> = {
  python: `# Write your solution below
import sys

def solve():
    # Read from standard input if needed
    # lines = sys.stdin.read().split()
    pass

if __name__ == '__main__':
    solve()
`,
  c: `#include <stdio.h>

int main() {
    // Write your solution here
    return 0;
}
`,
  cpp: `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    // Write your solution here
    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Write your solution here
    }
}
`,
};

export const CodingPage: React.FC<{ onComplete?: () => void }> = ({ onComplete }) => {
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
  const [maxViolations, setMaxViolations] = useState<number>(5);
  const attemptIdRef = useRef<string>('');

  // Terminal Console state
  const [terminalTab, setTerminalTab] = useState<'console' | 'testcases' | 'custom' | 'submission'>('console');
  const [terminalOutput, setTerminalOutput] = useState<string>(
    `fest@sandbox:~$ ready\nEnvironment initialized for Level 2 (Coding Assessment).\nSelect a problem, write your solution, and click "Run Code" or "Submit Solution".\n`
  );
  const [customInput, setCustomInput] = useState<string>('');
  const [isTerminalExpanded, setIsTerminalExpanded] = useState<boolean>(false);
  const [activeTestCaseIdx, setActiveTestCaseIdx] = useState<number>(0);

  const [problemScores, setProblemScores] = useState<Record<string, number>>({});
  const [showFinalSubmitModal, setShowFinalSubmitModal] = useState(false);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(3600);

  useEffect(() => {
    fetchAttempt();

    const timerInterval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
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
            alert(`SECURITY WARNING: Tab switch detected in Coding Assessment! (${res.violation_count} of ${res.max_violations} strikes recorded).\nFurther tab switching will permanently terminate your assessment.`);
          }
        } catch (e) {
          console.error('Coding violation report failed', e);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    const preventCopy = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      alert('Action blocked: Copying and pasting are restricted during the assessment.');
    };

    document.addEventListener('copy', preventCopy);
    document.addEventListener('cut', preventCopy);
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    return () => {
      clearInterval(timerInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('copy', preventCopy);
      document.removeEventListener('cut', preventCopy);
    };
  }, []);

  const currentProblem = attempt?.problems?.[selectedProblemIndex];

  // Unique key for caching code per problem and language
  const currentCodeKey = `${selectedProblemIndex}-${language}`;
  const code = codeCache[currentCodeKey] ?? (STARTER_TEMPLATES[language] || '');

  const setCode = (newCode: string) => {
    setCodeCache((prev) => ({ ...prev, [currentCodeKey]: newCode }));
  };

  const fetchAttempt = async () => {
    try {
      const data = await apiFetch<any>('/coding/attempt');
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
      if (data.status === 'SUBMITTED') {
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

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    const key = `${selectedProblemIndex}-${newLang}`;
    if (!codeCache[key]) {
      setCodeCache((prev) => ({ ...prev, [key]: STARTER_TEMPLATES[newLang] || '' }));
    }
  };

  const handleProblemChange = (newIdx: number) => {
    setSelectedProblemIndex(newIdx);
    setRunResults(null);
    setSubmitResult(null);
    const prob = attempt?.problems?.[newIdx];
    if (prob?.sample_test_cases?.[0]?.input_data) {
      setCustomInput(prob.sample_test_cases[0].input_data);
    }
  };

  // Run against sample test cases
  const handleRunCode = async () => {
    if (!attempt || !currentProblem) return;
    setExecuting(true);
    setTerminalTab('console');
    setTerminalOutput((prev) => prev + `\n$ run solution.${language} (Executing against sample test cases...)\n`);

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
      setTerminalOutput((prev) => prev + `\n${res.terminal_output}\n`);
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Execution failed.';
      setTerminalOutput((prev) => prev + `\n[ERROR]: ${msg}\n`);
    } finally {
      setExecuting(false);
    }
  };

  // Run against custom input
  const handleRunCustomInput = async () => {
    if (!attempt || !currentProblem) return;
    setExecuting(true);
    setTerminalTab('console');
    setTerminalOutput((prev) => prev + `\n$ run --custom-input solution.${language}\n`);

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
      setTerminalOutput((prev) => prev + `\n${res.terminal_output}\n`);
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Execution failed.';
      setTerminalOutput((prev) => prev + `\n[ERROR]: ${msg}\n`);
    } finally {
      setExecuting(false);
    }
  };

  // Submit solution for authoritative grading
  const handleSubmit = async () => {
    if (!attempt || !currentProblem) return;
    if (!confirm(`Submit solution for "${currentProblem.title}" (${currentProblem.marks} Marks)? This will evaluate against all hidden test cases.`)) return;

    setExecuting(true);
    setTerminalTab('submission');
    setTerminalOutput((prev) => prev + `\n$ submit solution.${language} --problem P${currentProblem.order_num}\nEvaluating submission...\n`);

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
      setTerminalOutput((prev) => prev + `\n${res.terminal_output}\n`);
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Submission evaluation failed.';
      setTerminalOutput((prev) => prev + `\n[SUBMISSION ERROR]: ${msg}\n`);
    } finally {
      setExecuting(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!attempt) return;
    setIsFinalSubmitting(true);
    try {
      const res = await apiFetch<any>('/coding/final-submit', {
        method: 'POST',
        body: JSON.stringify({ attempt_id: attempt.attempt_id }),
      });
      setFinalResult(res);
      setShowFinalSubmitModal(false);
      setShowCompletedModal(true);
    } catch (err: any) {
      alert(`Final submission failed: ${err?.detail || err.message}`);
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
    <div className="h-screen flex flex-col bg-[#F6F6F2] font-sans text-[#1B2029]">
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
                const difficultyBadge = idx === 0 ? 'EASY · 20M' : 'HARD · 40M';
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
                    <span className={`text-[10px] font-mono font-bold ${
                      scoreForProb === p.marks
                        ? 'text-[#3FB950]'
                        : scoreForProb > 0
                        ? 'text-[#E3B341]'
                        : isSelected ? 'text-white/60' : 'text-[#8B93A0]'
                    }`}>
                      [{scoreForProb}/{p.marks}]
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center space-x-3 font-mono text-xs">
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
          <div className={`overflow-hidden transition-all ${isTerminalExpanded ? 'h-0 hidden' : 'flex-1'}`}>
            <Editor
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
              }}
            />
          </div>

          {/* Collapsible / Expandable Terminal Console (Architecture §8) */}
          <div className={`border-t border-[#16233F] bg-[#0D1117] text-[#C9D1D9] flex flex-col font-mono text-xs transition-all duration-200 ${
            isTerminalExpanded ? 'flex-1 h-full' : 'h-[250px]'
          }`}>
            {/* Terminal Header Bar */}
            <div className="bg-[#161B22] border-b border-white/10 px-4 py-1.5 flex items-center justify-between select-none">
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setTerminalTab('console')}
                  className={`px-3 py-1 text-[11px] rounded-[3px] transition-colors ${
                    terminalTab === 'console'
                      ? 'bg-[#21262D] text-white font-bold'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  Terminal Log
                </button>
                <button
                  onClick={() => setTerminalTab('testcases')}
                  className={`px-3 py-1 text-[11px] rounded-[3px] transition-colors flex items-center space-x-1 ${
                    terminalTab === 'testcases'
                      ? 'bg-[#21262D] text-white font-bold'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  <span>Test Results</span>
                  {runResults && (
                    <span className={`w-2 h-2 rounded-full ${runResults.all_passed ? 'bg-[#3FB950]' : 'bg-[#F85149]'}`} />
                  )}
                </button>
                <button
                  onClick={() => setTerminalTab('custom')}
                  className={`px-3 py-1 text-[11px] rounded-[3px] transition-colors ${
                    terminalTab === 'custom'
                      ? 'bg-[#21262D] text-white font-bold'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  Custom Input
                </button>
                {submitResult && (
                  <button
                    onClick={() => setTerminalTab('submission')}
                    className={`px-3 py-1 text-[11px] rounded-[3px] transition-colors flex items-center space-x-1 ${
                      terminalTab === 'submission'
                        ? 'bg-[#21262D] text-white font-bold'
                        : 'text-[#8B949E] hover:text-white'
                    }`}
                  >
                    <span>Verdict</span>
                    <span className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                      submitResult.verdict === 'ACCEPTED' ? 'bg-[#3FB950]/20 text-[#3FB950]' : 'bg-[#F85149]/20 text-[#F85149]'
                    }`}>
                      {submitResult.score}/{currentProblem?.marks}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2 text-[#8B949E]">
                <button
                  onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                  className="hover:text-white text-[11px] px-2 py-0.5 rounded hover:bg-[#21262D]"
                  title={isTerminalExpanded ? "Restore Editor View" : "Maximize Terminal"}
                >
                  {isTerminalExpanded ? '↙ Minimize' : '↗ Maximize'}
                </button>
              </div>
            </div>

            {/* Terminal Tab Contents */}
            <div className="flex-1 p-3 overflow-y-auto font-mono text-[11.5px] leading-relaxed">
              {/* TAB 1: Raw Sandbox Log */}
              {terminalTab === 'console' && (
                <pre className="whitespace-pre-wrap text-[#E6EDF3] font-mono selection:bg-[#388BFD]/30">
                  {terminalOutput}
                </pre>
              )}

              {/* TAB 2: Structured Test Results */}
              {terminalTab === 'testcases' && (
                <div className="space-y-3">
                  {runResults ? (
                    <>
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            runResults.all_passed ? 'bg-[#3FB950]/20 text-[#3FB950]' : 'bg-[#F85149]/20 text-[#F85149]'
                          }`}>
                            {runResults.all_passed ? 'ALL SAMPLES PASSED' : 'SAMPLE TESTS FAILED'}
                          </span>
                          <span className="text-[#8B949E] text-xs">
                            {runResults.passed_cases} / {runResults.total_cases} Passed
                          </span>
                        </div>
                        <span className="text-[#8B949E] text-xs font-mono">
                          Engine: {runResults.judge_endpoint || 'local sandbox'}
                        </span>
                      </div>

                      {/* Test Case Selectors */}
                      <div className="flex space-x-2">
                        {runResults.results?.map((res: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setActiveTestCaseIdx(idx)}
                            className={`px-3 py-1 rounded text-xs font-mono flex items-center space-x-1.5 ${
                              activeTestCaseIdx === idx
                                ? 'bg-[#21262D] text-white font-bold border border-white/20'
                                : 'bg-[#161B22] text-[#8B949E] hover:text-white'
                            }`}
                          >
                            <span>Case {idx + 1}</span>
                            <span className={res.passed ? 'text-[#3FB950]' : 'text-[#F85149]'}>
                              {res.passed ? '✓' : '✗'}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Active Test Case Detail */}
                      {runResults.results?.[activeTestCaseIdx] && (
                        <div className="bg-[#161B22] p-3 rounded border border-white/10 space-y-2 text-xs">
                          <div>
                            <span className="text-[#8B949E] block mb-0.5">Input:</span>
                            <pre className="bg-[#0D1117] p-2 rounded text-white overflow-x-auto">
                              {runResults.results[activeTestCaseIdx].input_data}
                            </pre>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[#8B949E] block mb-0.5">Expected Output:</span>
                              <pre className="bg-[#0D1117] p-2 rounded text-[#3FB950] overflow-x-auto">
                                {runResults.results[activeTestCaseIdx].expected_output}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[#8B949E] block mb-0.5">Actual Output:</span>
                              <pre className={`bg-[#0D1117] p-2 rounded overflow-x-auto ${
                                runResults.results[activeTestCaseIdx].passed ? 'text-[#3FB950]' : 'text-[#F85149]'
                              }`}>
                                {runResults.results[activeTestCaseIdx].actual_output || '(no output)'}
                              </pre>
                            </div>
                          </div>
                          {runResults.results[activeTestCaseIdx].error_message && (
                            <div>
                              <span className="text-[#F85149] block mb-0.5">Error / Stderr:</span>
                              <pre className="bg-[#0D1117] p-2 rounded text-[#F85149] overflow-x-auto">
                                {runResults.results[activeTestCaseIdx].error_message}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-[#8B949E] italic text-center py-6">
                      Click "Run Code" to evaluate your solution against public sample test cases.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Custom Input Console */}
              {terminalTab === 'custom' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#8B949E]">
                      Provide custom input lines to standard input (stdin):
                    </span>
                    <button
                      disabled={executing}
                      onClick={handleRunCustomInput}
                      className="px-3 py-1 bg-[#238636] text-white text-xs font-bold rounded hover:bg-[#2ea043] disabled:opacity-50"
                    >
                      {executing ? 'Executing…' : '▶ Run with Custom Input'}
                    </button>
                  </div>
                  <textarea
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    rows={6}
                    placeholder="Enter input data here..."
                    className="w-full bg-[#161B22] border border-white/10 rounded-[4px] p-2.5 text-white font-mono text-xs focus:outline-none focus:border-[#388BFD]"
                  />
                </div>
              )}

              {/* TAB 4: Submission Summary */}
              {terminalTab === 'submission' && submitResult && (
                <div className="p-4 bg-[#161B22] border border-white/10 rounded-[6px] space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <div className={`text-lg font-bold ${
                        submitResult.verdict === 'ACCEPTED' ? 'text-[#3FB950]' : 'text-[#F85149]'
                      }`}>
                        {submitResult.verdict === 'ACCEPTED' ? '✓ ACCEPTED' : `✗ ${submitResult.verdict}`}
                      </div>
                      <div className="text-xs text-[#8B949E] mt-0.5">
                        Submission ID: #{submitResult.submission_id.slice(0, 8)} · Problem: {currentProblem?.title}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-bold text-white font-mono">
                        {submitResult.score} <span className="text-sm text-[#8B949E]">/ {currentProblem?.marks} Marks</span>
                      </div>
                      <div className="text-xs text-[#3FB950]">
                        {submitResult.test_cases_passed} of {submitResult.total_test_cases} Test Cases Passed
                      </div>
                    </div>
                  </div>

                  <pre className="text-xs text-[#E6EDF3] bg-[#0D1117] p-3 rounded font-mono overflow-x-auto">
                    {submitResult.terminal_output}
                  </pre>
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
              <div className="font-semibold text-[#59626F] uppercase tracking-wider text-[10.5px]">
                Current Score Summary:
              </div>
              {attempt?.problems?.map((p: any, idx: number) => {
                const s = problemScores[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center justify-between py-1 border-b border-[#DBD7C9]/40 last:border-0">
                    <span className="font-mono">
                      P{idx + 1}: {p.title} ({idx === 0 ? 'Easy' : 'Hard'})
                    </span>
                    <span className={`font-mono font-bold ${s === p.marks ? 'text-[#1E7A46]' : (s > 0 ? 'text-[#8A5A00]' : 'text-[#AE2E22]')}`}>
                      {s} / {p.marks} Marks
                    </span>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-2 border-t border-[#DBD7C9] font-bold text-sm">
                <span>Total Level 2 Score:</span>
                <span className="font-mono text-[#16233F]">
                  {attempt?.problems?.reduce((acc: number, p: any) => acc + (problemScores[p.id] || 0), 0) || 0} / 60 Marks
                </span>
              </div>
            </div>

            <p className="text-xs text-[#59626F] leading-relaxed">
              Submitting now will finalize your Level 2 Coding Assessment attempt and lock your results for the leaderboard.
            </p>

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
                Level 02 Submitted!
              </h3>
              <p className="text-xs text-[#59626F] mt-1">
                Your coding solutions have been evaluated and recorded.
              </p>
            </div>

            <div className="bg-[#F6F6F2] p-4 rounded-[4px] border border-[#DBD7C9] text-left space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-[#DBD7C9]/50">
                <span className="text-[#59626F]">Problem 1 (Two Sum):</span>
                <span className="font-mono font-bold text-[#16233F]">
                  {finalResult?.problem_scores?.[0]?.best_score ?? (attempt?.problems?.[0] ? problemScores[attempt.problems[0].id] || 0 : 0)} / 20 Marks
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#DBD7C9]/50">
                <span className="text-[#59626F]">Problem 2 (Trapping Rain Water):</span>
                <span className="font-mono font-bold text-[#16233F]">
                  {finalResult?.problem_scores?.[1]?.best_score ?? (attempt?.problems?.[1] ? problemScores[attempt.problems[1].id] || 0 : 0)} / 40 Marks
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 font-bold text-sm">
                <span>Final Score:</span>
                <span className="font-mono text-[#1E7A46]">
                  {finalResult?.total_score ?? (attempt?.problems?.reduce((acc: number, p: any) => acc + (problemScores[p.id] || 0), 0) || 0)} / 60 Marks
                </span>
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
