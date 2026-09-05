from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    Participant, Round, CodingProblem, CodingTestCase,
    CodingAttempt, CodingSubmission, RoundResult, CompetitionSetting
)
from app.api.deps import get_current_participant
from app.services.judge0 import judge0_service

router = APIRouter(prefix="/coding", tags=["Coding Assessment"])

# ─── Schemas ───

class PublicTestCase(BaseModel):
    id: str
    input_data: str
    expected_output: str
    order_num: int

class CodingProblemOut(BaseModel):
    id: str
    title: str
    description: str
    constraints: Optional[str]
    time_limit_ms: int
    memory_limit_mb: int
    marks: int
    order_num: int
    sample_test_cases: List[PublicTestCase]

class CodingAttemptResponse(BaseModel):
    attempt_id: str
    status: str
    remaining_seconds: int
    duration_seconds: int
    problems: List[CodingProblemOut]

class RunCodeRequest(BaseModel):
    problem_id: str
    language: str = Field(..., pattern=r"^(python|c|cpp|java)$")
    code: str = Field(..., min_length=1)
    custom_input: Optional[str] = None

class TestCaseResult(BaseModel):
    test_case_id: str
    input_data: str
    expected_output: str
    actual_output: str
    passed: bool
    status: str
    execution_time_ms: Optional[int] = None
    error_message: Optional[str] = None

class RunCodeResponse(BaseModel):
    all_passed: bool
    total_cases: int
    passed_cases: int
    results: List[TestCaseResult]
    judge_endpoint: Optional[str] = None
    terminal_output: str

class SubmitCodeRequest(BaseModel):
    attempt_id: str
    problem_id: str
    language: str
    code: str

class SubmitCodeResponse(BaseModel):
    submission_id: str
    problem_id: str
    status: str
    test_cases_passed: int
    total_test_cases: int
    score: int
    execution_time_ms: Optional[int]
    terminal_output: str
    verdict: str

# ─── Endpoints ───

@router.get("/attempt", response_model=CodingAttemptResponse)
async def get_or_start_coding_attempt(
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    # Check if Round 2 is open
    round_res = await db.execute(select(Round).where(Round.round_number == 2).limit(1))
    round_2 = round_res.scalar_one_or_none()
    if not round_2 or not round_2.is_open:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Level 02 · Coding Assessment is not currently open."
        )

    # Check qualification from Round 1
    # Check result
    result_query = await db.execute(
        select(RoundResult).where(
            RoundResult.participant_id == current_participant.id,
            RoundResult.is_qualified == True
        )
    )
    if not result_query.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Participant has not qualified for Level 2."
        )

    # Dynamic duration from settings or round default
    duration_setting = await db.execute(
        select(CompetitionSetting.value).where(CompetitionSetting.key == "coding_duration_seconds")
    )
    val = duration_setting.scalar_one_or_none()
    duration_sec = int(val) if val else round_2.duration_minutes * 60

    # Get or create attempt
    att_res = await db.execute(
        select(CodingAttempt).where(
            CodingAttempt.participant_id == current_participant.id,
            CodingAttempt.round_id == round_2.id
        )
    )
    attempt = att_res.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if not attempt:
        attempt = CodingAttempt(
            participant_id=current_participant.id,
            round_id=round_2.id,
            started_at=now,
            duration_seconds=duration_sec,
            status="IN_PROGRESS"
        )
        db.add(attempt)
        await db.commit()
        await db.refresh(attempt)

    started_at = attempt.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)

    elapsed = (now - started_at).total_seconds()
    remaining = max(0, int(attempt.duration_seconds - elapsed))

    # Fetch problems with public test cases only (HIDDEN TEST CASES NEVER LEAKED)
    probs_res = await db.execute(
        select(CodingProblem)
        .options(selectinload(CodingProblem.test_cases))
        .where(CodingProblem.round_id == round_2.id)
        .order_by(CodingProblem.order_num.asc())
    )
    problems = probs_res.scalars().all()

    problem_list = []
    for p in problems:
        samples = [
            PublicTestCase(
                id=tc.id,
                input_data=tc.input_data,
                expected_output=tc.expected_output,
                order_num=tc.order_num
            )
            for tc in p.test_cases if not tc.is_hidden
        ]
        problem_list.append(CodingProblemOut(
            id=p.id,
            title=p.title,
            description=p.description,
            constraints=p.constraints,
            time_limit_ms=p.time_limit_ms,
            memory_limit_mb=p.memory_limit_mb,
            marks=p.marks,
            order_num=p.order_num,
            sample_test_cases=samples
        ))

    return CodingAttemptResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        remaining_seconds=remaining,
        duration_seconds=attempt.duration_seconds,
        problems=problem_list
    )

@router.post("/run", response_model=RunCodeResponse)
async def run_code(
    payload: RunCodeRequest,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Executes code against sample/public test cases or custom input.
    Returns structured results and an authentic terminal output stream.
    """
    prob_res = await db.execute(
        select(CodingProblem)
        .options(selectinload(CodingProblem.test_cases))
        .where(CodingProblem.id == payload.problem_id)
    )
    problem = prob_res.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found.")

    # 1. Custom input branch
    if payload.custom_input is not None:
        res = await judge0_service.execute_code(
            source_code=payload.code,
            language=payload.language,
            stdin=payload.custom_input,
            cpu_time_limit_sec=problem.time_limit_ms / 1000.0,
            memory_limit_mb=problem.memory_limit_mb
        )
        out = res.get("stdout", "") or res.get("compile_output", "") or res.get("stderr", "")
        passed = (res.get("status_id") == 3)
        tc_res = TestCaseResult(
            test_case_id="custom",
            input_data=payload.custom_input,
            expected_output="(Custom Input)",
            actual_output=out,
            passed=passed,
            status=res.get("status", "Unknown"),
            execution_time_ms=int(res["execution_time_sec"] * 1000) if res.get("execution_time_sec") else None,
            error_message=res.get("stderr") or res.get("compile_output") or None
        )
        t_lines = [
            f"fest@sandbox:~$ run --custom-input solution.{payload.language}",
            f"Input: {payload.custom_input.strip()}",
            "─" * 45,
            "[Program Output]:"
        ]
        if res.get("compile_output"):
            t_lines.append(f"Compile Error:\n{res['compile_output']}")
        if out:
            t_lines.append(out)
        if res.get("stderr"):
            t_lines.append(f"Stderr:\n{res['stderr']}")
        t_lines.append("─" * 45)
        t_lines.append(f"Status: {res.get('status')} | Time: {tc_res.execution_time_ms or 0}ms | Engine: {res.get('endpoint_used', 'local')}")
        return RunCodeResponse(
            all_passed=passed,
            total_cases=1,
            passed_cases=1 if passed else 0,
            results=[tc_res],
            judge_endpoint=res.get("endpoint_used"),
            terminal_output="\n".join(t_lines)
        )

    # 2. Public sample test cases branch
    public_cases = [tc for tc in problem.test_cases if not tc.is_hidden]
    results: List[TestCaseResult] = []
    all_passed = True
    endpoint_used = None

    for tc in public_cases:
        res = await judge0_service.execute_code(
            source_code=payload.code,
            language=payload.language,
            stdin=tc.input_data,
            expected_output=tc.expected_output,
            cpu_time_limit_sec=problem.time_limit_ms / 1000.0,
            memory_limit_mb=problem.memory_limit_mb
        )

        if not res.get("success"):
            results.append(TestCaseResult(
                test_case_id=tc.id,
                input_data=tc.input_data,
                expected_output=tc.expected_output,
                actual_output="",
                passed=False,
                status="ERROR",
                error_message=res.get("error")
            ))
            all_passed = False
            continue

        endpoint_used = res.get("endpoint_used")
        passed = res.get("passed", False)
        if not passed:
            all_passed = False

        results.append(TestCaseResult(
            test_case_id=tc.id,
            input_data=tc.input_data,
            expected_output=tc.expected_output,
            actual_output=res.get("stdout", "") or res.get("compile_output", "") or res.get("stderr", ""),
            passed=passed,
            status=res.get("status", "Unknown"),
            execution_time_ms=int(res["execution_time_sec"] * 1000) if res.get("execution_time_sec") else None,
            error_message=res.get("stderr") or res.get("compile_output") or None
        ))

    passed_count = sum(1 for r in results if r.passed)

    term_lines = [
        f"fest@sandbox:~$ run solution.{payload.language}",
        f"Compiling and executing against {len(public_cases)} sample test case(s)...",
        ""
    ]
    for idx, r in enumerate(results, start=1):
        icon = "✓" if r.passed else "✗"
        term_lines.append(f"── Test Case #{idx} [{icon} {r.status}] ──")
        term_lines.append(f"Input:    {r.input_data.replace(chr(10), ' ')}")
        term_lines.append(f"Expected: {r.expected_output.replace(chr(10), ' ')}")
        term_lines.append(f"Output:   {r.actual_output.replace(chr(10), ' ')}")
        if r.error_message:
            term_lines.append(f"Details:  {r.error_message}")
        term_lines.append(f"Time:     {r.execution_time_ms or 0}ms")
        term_lines.append("")

    summary_str = "SUCCESS: ALL SAMPLE CASES PASSED" if all_passed else "FAIL: SAMPLE CASES FAILED"
    term_lines.append("=" * 55)
    term_lines.append(f"Verdict: {summary_str} ({passed_count}/{len(public_cases)} Passed)")
    term_lines.append(f"Engine:  {endpoint_used or 'local_builtin_sandbox'}")
    term_lines.append(f"Status:  Exit code {0 if all_passed else 1}")

    return RunCodeResponse(
        all_passed=all_passed,
        total_cases=len(public_cases),
        passed_cases=passed_count,
        results=results,
        judge_endpoint=endpoint_used,
        terminal_output="\n".join(term_lines)
    )

@router.post("/submit", response_model=SubmitCodeResponse)
async def submit_code(
    payload: SubmitCodeRequest,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Evaluates code against ALL test cases (public + hidden) via Judge0.
    Server calculates authoritative score and returns full terminal evaluation stream.
    """
    attempt_res = await db.execute(
        select(CodingAttempt).where(
            CodingAttempt.id == payload.attempt_id,
            CodingAttempt.participant_id == current_participant.id
        )
    )
    attempt = attempt_res.scalar_one_or_none()
    if not attempt or attempt.status != "IN_PROGRESS":
        raise HTTPException(status_code=400, detail="No active attempt found.")

    prob_res = await db.execute(
        select(CodingProblem)
        .options(selectinload(CodingProblem.test_cases))
        .where(CodingProblem.id == payload.problem_id)
    )
    problem = prob_res.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found.")

    all_cases = sorted(problem.test_cases, key=lambda tc: tc.order_num)
    passed_count = 0
    total_cases = len(all_cases) or 1
    total_time_ms = 0
    failure_reason = None
    case_logs = []

    for tc in all_cases:
        res = await judge0_service.execute_code(
            source_code=payload.code,
            language=payload.language,
            stdin=tc.input_data,
            expected_output=tc.expected_output,
            cpu_time_limit_sec=problem.time_limit_ms / 1000.0,
            memory_limit_mb=problem.memory_limit_mb
        )
        is_pass = res.get("success") and res.get("passed")
        t_ms = int(res["execution_time_sec"] * 1000) if res.get("execution_time_sec") else 0
        status_txt = res.get("status", "Error")
        if is_pass:
            passed_count += 1
            total_time_ms += t_ms
        elif not failure_reason:
            failure_reason = status_txt
        case_logs.append((tc, is_pass, t_ms, status_txt))

    fraction = passed_count / total_cases
    earned_score = int(round(fraction * problem.marks))
    verdict = "ACCEPTED" if passed_count == total_cases else ("PARTIALLY ACCEPTED" if passed_count > 0 else (failure_reason or "WRONG ANSWER").upper())

    submission = CodingSubmission(
        attempt_id=attempt.id,
        problem_id=problem.id,
        language=payload.language,
        code=payload.code,
        status="COMPLETED",
        test_cases_passed=passed_count,
        total_test_cases=total_cases,
        score=earned_score,
        execution_time_ms=total_time_ms,
        failure_reason=failure_reason
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    term_lines = [
        f"fest@sandbox:~$ submit --problem P{problem.order_num} solution.{payload.language}",
        f"Evaluating submission against {total_cases} test cases (Public & Hidden)...",
        ""
    ]
    for idx, (tc, p_flag, t_ms, stat) in enumerate(case_logs, start=1):
        type_str = "Sample" if not tc.is_hidden else "Hidden"
        icon = "✓ PASSED" if p_flag else f"✗ {stat}"
        term_lines.append(f"  Test Case #{idx} ({type_str}): {icon} ({t_ms}ms)")

    term_lines.append("")
    term_lines.append("=" * 55)
    term_lines.append(f"VERDICT:       {verdict}")
    term_lines.append(f"Score:         {earned_score} / {problem.marks} Marks ({passed_count}/{total_cases} test cases passed)")
    term_lines.append(f"Total Time:    {total_time_ms}ms")
    term_lines.append(f"Submission ID: {submission.id[:8]}")

    return SubmitCodeResponse(
        submission_id=submission.id,
        problem_id=problem.id,
        status="COMPLETED",
        test_cases_passed=passed_count,
        total_test_cases=total_cases,
        score=earned_score,
        execution_time_ms=total_time_ms,
        terminal_output="\n".join(term_lines),
        verdict=verdict
    )
