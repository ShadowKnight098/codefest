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

export const CodingPage: React.FC<{ onComplete?: () => void }> = () => {
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

  useEffect(() => {
    fetchAttempt();

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
      if (data.violations_count !== undefined) {
        setTabSwitchCount(data.violations_count);
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
      setTerminalOutput((prev) => prev + `\n${res.terminal_output}\n`);
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Submission evaluation failed.';
      setTerminalOutput((prev) => prev + `\n[SUBMISSION ERROR]: ${msg}\n`);
    } finally {
      setExecuting(false);
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
        remainingSeconds={attempt?.remaining_seconds || 3600}
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
                    <span>P{idx + 1}: {p.title}</span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                      idx === 0
                        ? (isSelected ? 'bg-[#1E7A46] text-white' : 'bg-[#E8F3EC] text-[#1E7A46]')
                        : (isSelected ? 'bg-[#C0392B] text-white' : 'bg-[#FDEDEC] text-[#C0392B]')
                    }`}>
                      {difficultyBadge}
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
                      {selectedProblemIndex === 0 ? 'Level: Easy' : 'Level: Hard'}
                    </span>
                    <span className="text-[11px] font-mono text-[#59626F]">
                      Marks: <strong>{currentProblem.marks} Points</strong>
                    </span>
                    <span className="text-[11px] font-mono text-[#8B93A0]">
                      Time Limit: {currentProblem.time_limit_ms / 1000}s
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-[#16233F] font-serif mt-1">
                    Problem {selectedProblemIndex + 1}: {currentProblem.title}
                  </h2>
                </div>

                <div className="whitespace-pre-line text-[#1B2029] text-[13px] leading-relaxed font-sans">
                  {currentProblem.description}
                </div>

                {currentProblem.constraints && (
                  <div>
                    <h3 className="font-bold text-[#16233F] uppercase text-[11px] mb-1.5 font-mono tracking-wider">
                      Constraints
                    </h3>
                    <pre className="p-3 bg-[#F6F6F2] border border-[#DBD7C9] rounded-[3px] font-mono text-[11.5px] text-[#1B2029]">
                      {currentProblem.constraints}
                    </pre>
                  </div>
                )}

                {/* Sample Test Cases */}
                <div>
                  <h3 className="font-bold text-[#16233F] uppercase text-[11px] mb-2 font-mono tracking-wider">
                    Sample Test Cases
                  </h3>
                  {currentProblem.sample_test_cases?.map((tc: any, i: number) => (
                    <div key={tc.id} className="mb-3 p-3.5 bg-[#F6F6F2] border border-[#DBD7C9] rounded-[4px] space-y-2">
                      <div className="font-mono text-[11px] text-[#16233F] font-bold">
                        Example {i + 1}:
                      </div>
                      <div>
                        <span className="text-[10px] text-[#59626F] font-mono uppercase font-bold">Input:</span>
                        <pre className="font-mono text-[12px] bg-white p-2 border border-[#DBD7C9] rounded-[3px] mt-0.5 overflow-x-auto text-[#16233F]">
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
          <div className="px-4 py-2 bg-[#F6F6F2] border-b border-[#DBD7C9] flex items-center justify-between">
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
                className="px-4 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] hover:bg-[#25355B] disabled:opacity-50 transition-colors flex items-center space-x-1.5 shadow-sm"
              >
                <span>Submit Solution</span>
                <span>→</span>
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

          {/* ─── REAL TERMINAL CONSOLE ─── */}
          <div className={`border-t-2 border-[#16233F] bg-[#0D1117] flex flex-col font-mono text-white transition-all ${
            isTerminalExpanded ? 'flex-1' : 'h-[310px]'
          }`}>
            {/* Terminal Header & Navigation Tabs */}
            <div className="px-3 py-1.5 bg-[#161B22] border-b border-white/10 flex items-center justify-between select-none">
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-[#3FB950] font-bold text-sm mr-2">{'>_'} TERMINAL</span>

                {/* Tab: Console Output */}
                <button
                  onClick={() => setTerminalTab('console')}
                  className={`px-3 py-1 rounded-[3px] text-xs transition-colors ${
                    terminalTab === 'console'
                      ? 'bg-[#21262D] text-white font-bold border border-white/10'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  Console Output
                </button>

                {/* Tab: Test Cases */}
                <button
                  onClick={() => setTerminalTab('testcases')}
                  className={`px-3 py-1 rounded-[3px] text-xs transition-colors flex items-center space-x-1 ${
                    terminalTab === 'testcases'
                      ? 'bg-[#21262D] text-white font-bold border border-white/10'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  <span>Sample Cases</span>
                  {runResults && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                      runResults.all_passed ? 'bg-[#238636] text-white' : 'bg-[#DA3633] text-white'
                    }`}>
                      {runResults.passed_cases}/{runResults.total_cases}
                    </span>
                  )}
                </button>

                {/* Tab: Custom Input */}
                <button
                  onClick={() => setTerminalTab('custom')}
                  className={`px-3 py-1 rounded-[3px] text-xs transition-colors ${
                    terminalTab === 'custom'
                      ? 'bg-[#21262D] text-white font-bold border border-white/10'
                      : 'text-[#8B949E] hover:text-white'
                  }`}
                >
                  Custom Input
                </button>

                {/* Tab: Submission Verdict */}
                {submitResult && (
                  <button
                    onClick={() => setTerminalTab('submission')}
                    className={`px-3 py-1 rounded-[3px] text-xs transition-colors flex items-center space-x-1.5 ${
                      terminalTab === 'submission'
                        ? 'bg-[#21262D] text-[#3FB950] font-bold border border-[#3FB950]/30'
                        : 'text-[#3FB950] hover:text-white'
                    }`}
                  >
                    <span>● Verdict: {submitResult.verdict}</span>
                    <span className="bg-[#238636] text-white text-[10px] px-1.5 py-0.2 rounded">
                      {submitResult.score}/{currentProblem?.marks}
                    </span>
                  </button>
                )}
              </div>

              {/* Terminal Controls */}
              <div className="flex items-center space-x-2 text-xs">
                {executing && (
                  <span className="text-[#D29922] flex items-center space-x-1 text-[11px] animate-pulse">
                    <span>●</span>
                    <span>Running…</span>
                  </span>
                )}
                <button
                  onClick={() => setTerminalOutput(`fest@sandbox:~$ ready\nConsole cleared.\n`)}
                  className="px-2 py-0.5 text-[#8B949E] hover:text-white hover:bg-white/10 rounded text-[11px]"
                  title="Clear Console Output"
                >
                  Clear
                </button>
                <button
                  onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                  className="px-2 py-0.5 text-[#8B949E] hover:text-white hover:bg-white/10 rounded text-[11px]"
                  title={isTerminalExpanded ? 'Minimize Terminal' : 'Maximize Terminal'}
                >
                  {isTerminalExpanded ? '⤡ Restore Editor' : '⤢ Maximize'}
                </button>
              </div>
            </div>

            {/* Terminal Body Panels */}
            <div className="flex-1 p-3 overflow-y-auto text-[12px] leading-relaxed">
              {/* TAB 1: Console Output Stream */}
              {terminalTab === 'console' && (
                <pre className="text-[#E6EDF3] whitespace-pre-wrap font-mono select-text">
                  {terminalOutput}
                </pre>
              )}

              {/* TAB 2: Sample Test Cases Detailed Breakdown */}
              {terminalTab === 'testcases' && (
                <div className="space-y-3">
                  {runResults ? (
                    <div>
                      {/* Sub-tabs for each test case */}
                      <div className="flex items-center space-x-2 mb-3">
                        {runResults.results?.map((r: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setActiveTestCaseIdx(idx)}
                            className={`px-3 py-1 rounded-[3px] text-xs font-mono flex items-center space-x-1.5 ${
                              activeTestCaseIdx === idx
                                ? 'bg-[#21262D] text-white border border-white/20'
                                : 'bg-[#161B22] text-[#8B949E] hover:text-white'
                            }`}
                          >
                            <span>Case {idx + 1}</span>
                            <span className={r.passed ? 'text-[#3FB950]' : 'text-[#F85149]'}>
                              {r.passed ? '✓' : '✗'}
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Active Case Details */}
                      {runResults.results?.[activeTestCaseIdx] && (
                        <div className="p-3 bg-[#161B22] border border-white/10 rounded-[4px] space-y-2.5">
                          <div className="flex items-center justify-between border-b border-white/10 pb-2">
                            <span className={`text-xs font-bold ${
                              runResults.results[activeTestCaseIdx].passed ? 'text-[#3FB950]' : 'text-[#F85149]'
                            }`}>
                              {runResults.results[activeTestCaseIdx].passed ? '✓ PASSED' : `✗ ${runResults.results[activeTestCaseIdx].status}`}
                            </span>
                            <span className="text-[11px] text-[#8B949E]">
                              Time: {runResults.results[activeTestCaseIdx].execution_time_ms || 0}ms
                            </span>
                          </div>

                          <div>
                            <div className="text-[11px] text-[#8B949E] font-bold uppercase">Input:</div>
                            <pre className="p-2 bg-[#0D1117] rounded mt-0.5 text-white overflow-x-auto text-[11.5px]">
                              {runResults.results[activeTestCaseIdx].input_data}
                            </pre>
                          </div>

                          <div>
                            <div className="text-[11px] text-[#8B949E] font-bold uppercase">Expected Output:</div>
                            <pre className="p-2 bg-[#0D1117] rounded mt-0.5 text-[#3FB950] overflow-x-auto text-[11.5px]">
                              {runResults.results[activeTestCaseIdx].expected_output}
                            </pre>
                          </div>

                          <div>
                            <div className="text-[11px] text-[#8B949E] font-bold uppercase">Your Output:</div>
                            <pre className={`p-2 bg-[#0D1117] rounded mt-0.5 overflow-x-auto text-[11.5px] ${
                              runResults.results[activeTestCaseIdx].passed ? 'text-[#3FB950]' : 'text-[#F85149]'
                            }`}>
                              {runResults.results[activeTestCaseIdx].actual_output || '(No output)'}
                            </pre>
                          </div>

                          {runResults.results[activeTestCaseIdx].error_message && (
                            <div>
                              <div className="text-[11px] text-[#F85149] font-bold uppercase">Errors / Stderr:</div>
                              <pre className="p-2 bg-[#2E0B0B] text-[#FF7B72] rounded mt-0.5 overflow-x-auto text-[11px]">
                                {runResults.results[activeTestCaseIdx].error_message}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[#8B949E] py-4 text-center">
                      Click "Run Code" to execute your solution against sample test cases.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Custom Input Box */}
              {terminalTab === 'custom' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[#8B949E] text-xs">
                      Enter custom standard input (stdin) to test your code:
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
    </div>
  );
};
