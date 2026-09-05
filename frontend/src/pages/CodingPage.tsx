import React, { useState, useEffect } from 'react';
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
  const [code, setCode] = useState<string>(STARTER_TEMPLATES['python']);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [runResults, setRunResults] = useState<any>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchAttempt();
  }, []);

  const fetchAttempt = async () => {
    try {
      const data = await apiFetch<any>('/coding/attempt');
      setAttempt(data);
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
    setCode(STARTER_TEMPLATES[newLang] || '');
  };

  const handleRunCode = async () => {
    if (!attempt || !currentProblem) return;
    setExecuting(true);
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
      alert(err?.detail || 'Code execution failed.');
    } finally {
      setExecuting(false);
    }
  };

  const handleSubmit = async () => {
    if (!attempt || !currentProblem) return;
    if (!confirm('Are you ready to submit your solution for authoritative scoring?')) return;
    setExecuting(true);
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
      alert(`Submission successful! Score awarded: ${res.score} / ${currentProblem.marks}`);
    } catch (err: any) {
      alert(err?.detail || 'Submission failed.');
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center text-[#59626F] text-sm">
        Loading coding assessment…
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

  const currentProblem = attempt?.problems?.[selectedProblemIndex];

  return (
    <div className="h-screen flex flex-col bg-[#F6F6F2] font-sans text-[#1B2029]">
      <AssessmentHeader
        roundCode="LEVEL 02"
        roundName="CODING ASSESSMENT"
        remainingSeconds={attempt?.remaining_seconds || 3600}
      />

      {/* Main Split Layout: Left Problem Statement (38%), Right Monaco (62%) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Problem details & Sample Cases */}
        <div className="w-[38%] border-r border-[#DBD7C9] bg-white flex flex-col overflow-hidden">
          {/* Problem Selector Bar */}
          <div className="px-4 py-2 bg-[#F6F6F2] border-b border-[#DBD7C9] flex items-center space-x-2">
            {attempt?.problems?.map((p: any, idx: number) => (
              <button
                key={p.id}
                onClick={() => { setSelectedProblemIndex(idx); setRunResults(null); }}
                className={`px-3 py-1 text-xs font-mono font-medium rounded-[3px] transition-colors ${
                  selectedProblemIndex === idx
                    ? 'bg-[#16233F] text-white font-bold'
                    : 'bg-white border border-[#DBD7C9] text-[#59626F] hover:text-[#16233F]'
                }`}
              >
                P{idx + 1}
              </button>
            ))}
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
            {currentProblem ? (
              <>
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#59626F]">
                    Problem {selectedProblemIndex + 1} of {attempt.problems.length} · {currentProblem.marks} Marks
                  </span>
                  <h2 className="text-base font-bold text-[#16233F] mt-0.5">{currentProblem.title}</h2>
                </div>

                <div className="whitespace-pre-line text-[#1B2029]">
                  {currentProblem.description}
                </div>

                {currentProblem.constraints && (
                  <div>
                    <h3 className="font-bold text-[#16233F] uppercase text-[11px] mb-1 font-mono">Constraints</h3>
                    <pre className="p-2.5 bg-[#F6F6F2] border border-[#DBD7C9] rounded-[3px] font-mono text-[11px]">
                      {currentProblem.constraints}
                    </pre>
                  </div>
                )}

                {/* Sample Test Cases */}
                <div>
                  <h3 className="font-bold text-[#16233F] uppercase text-[11px] mb-2 font-mono">Sample Test Cases</h3>
                  {currentProblem.sample_test_cases?.map((tc: any, i: number) => (
                    <div key={tc.id} className="mb-3 p-3 bg-[#F6F6F2] border border-[#DBD7C9] rounded-[3px] space-y-1.5">
                      <div className="font-mono text-[10px] text-[#59626F] font-bold">Example {i + 1}</div>
                      <div>
                        <span className="text-[10px] text-[#59626F] font-mono">Input:</span>
                        <pre className="font-mono text-[11px] bg-white p-1.5 border border-[#DBD7C9] rounded-[2px] mt-0.5">{tc.input_data}</pre>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#59626F] font-mono">Expected Output:</span>
                        <pre className="font-mono text-[11px] bg-white p-1.5 border border-[#DBD7C9] rounded-[2px] mt-0.5">{tc.expected_output}</pre>
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

        {/* Right Panel: Editor + Results Drawer */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Editor Header Bar */}
          <div className="px-4 py-2 bg-[#F6F6F2] border-b border-[#DBD7C9] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs text-[#59626F] font-mono">Language:</span>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="text-xs border border-[#C6C1B0] rounded-[3px] px-2 py-1 bg-white font-mono"
              >
                <option value="python">Python 3 (ID: 71)</option>
                <option value="c">C (GCC 9)</option>
                <option value="cpp">C++ (GCC 9)</option>
                <option value="java">Java 13</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                disabled={executing}
                onClick={handleRunCode}
                className="px-3 py-1.5 bg-white border border-[#16233F] text-[#16233F] text-xs font-semibold rounded-[3px] hover:bg-[#EEF1F6] disabled:opacity-50"
              >
                {executing ? 'Executing…' : 'Run Code (Sample Cases)'}
              </button>
              <button
                disabled={executing}
                onClick={handleSubmit}
                className="px-4 py-1.5 bg-[#16233F] text-white text-xs font-semibold rounded-[3px] hover:bg-[#25355B] disabled:opacity-50"
              >
                Submit Solution →
              </button>
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 overflow-hidden">
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

          {/* Bottom Results Drawer */}
          {(runResults || submitResult) && (
            <div className="h-48 border-t border-[#DBD7C9] bg-[#F6F6F2] flex flex-col">
              <div className="px-4 py-1.5 bg-white border-b border-[#DBD7C9] flex items-center justify-between text-xs">
                <span className="font-bold text-[#16233F] font-mono">
                  {submitResult ? 'Submission Evaluation Result' : 'Execution Output (Sample Cases)'}
                </span>
                <button
                  onClick={() => { setRunResults(null); setSubmitResult(null); }}
                  className="text-[#8B93A0] hover:text-[#16233F]"
                >
                  ✕ Close
                </button>
              </div>

              <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
                {runResults && (
                  <div>
                    <div className="flex items-center space-x-2 mb-2 font-mono text-[11px]">
                      <span className={`px-2 py-0.5 rounded-[2px] font-bold ${
                        runResults.all_passed ? 'bg-[#E8F3EC] text-[#1E7E34]' : 'bg-[#FCEDEC] text-[#A82A2A]'
                      }`}>
                        {runResults.passed_cases} / {runResults.total_cases} Passed
                      </span>
                      {runResults.judge_endpoint && (
                        <span className="text-[#8B93A0]">Executed on: {runResults.judge_endpoint}</span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {runResults.results?.map((r: any, idx: number) => (
                        <div key={idx} className="p-2 bg-white border border-[#DBD7C9] rounded-[3px]">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-[11px]">Case {idx + 1}: {r.status}</span>
                            <span className="font-mono text-[10px] text-[#8B93A0]">{r.execution_time_ms ? `${r.execution_time_ms}ms` : ''}</span>
                          </div>
                          {r.actual_output && (
                            <pre className="font-mono text-[10px] text-[#59626F] mt-1 bg-[#F6F6F2] p-1 rounded">
                              Output: {r.actual_output}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {submitResult && (
                  <div className="p-3 bg-white border border-[#DBD7C9] rounded-[3px]">
                    <div className="font-bold text-[#1E7E34] text-sm">
                      Score: {submitResult.score} Marks ({submitResult.test_cases_passed} / {submitResult.total_test_cases} Test Cases Passed)
                    </div>
                    <div className="text-[11px] text-[#59626F] mt-1">
                      Status: {submitResult.status} · Total Execution Time: {submitResult.execution_time_ms}ms
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
