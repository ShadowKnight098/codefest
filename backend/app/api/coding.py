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
    Executes code against sample/public test cases only.
    Dispatched to Judge0 load balancer across 4 laptops.
    """
    prob_res = await db.execute(
        select(CodingProblem)
        .options(selectinload(CodingProblem.test_cases))
        .where(CodingProblem.id == payload.problem_id)
    )
    problem = prob_res.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found.")

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
        print(f"[CODING RUN] res for tc {tc.id}: {res}")

        if not res.get("success"):
            # If all judge0 nodes offline, simulate basic execution or report status
            results.append(TestCaseResult(
                test_case_id=tc.id,
                input_data=tc.input_data,
                expected_output=tc.expected_output,
                actual_output="",
                passed=False,
                status="JUDGE_UNAVAILABLE",
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
    return RunCodeResponse(
        all_passed=all_passed,
        total_cases=len(public_cases),
        passed_cases=passed_count,
        results=results,
        judge_endpoint=endpoint_used
    )

@router.post("/submit", response_model=SubmitCodeResponse)
async def submit_code(
    payload: SubmitCodeRequest,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Evaluates code against ALL test cases (public + hidden) via Judge0.
    Server calculates authoritative score (0, 5, 10, 15, 20).
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

    for tc in all_cases:
        res = await judge0_service.execute_code(
            source_code=payload.code,
            language=payload.language,
            stdin=tc.input_data,
            expected_output=tc.expected_output,
            cpu_time_limit_sec=problem.time_limit_ms / 1000.0,
            memory_limit_mb=problem.memory_limit_mb
        )
        if res.get("success") and res.get("passed"):
            passed_count += 1
            if res.get("execution_time_sec"):
                total_time_ms += int(res["execution_time_sec"] * 1000)
        elif not failure_reason and res.get("success"):
            failure_reason = res.get("status")

    # Score calculation proportional to marks
    fraction = passed_count / total_cases
    earned_score = int(round(fraction * problem.marks))

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

    return SubmitCodeResponse(
        submission_id=submission.id,
        problem_id=problem.id,
        status="COMPLETED",
        test_cases_passed=passed_count,
        total_test_cases=total_cases,
        score=earned_score,
        execution_time_ms=total_time_ms
    )
