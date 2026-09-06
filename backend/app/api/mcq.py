from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import random
from pydantic import BaseModel

from app.db.session import get_db
from app.db.models import (
    Participant, Round, MCQQuestion, MCQAttempt, 
    MCQAttemptQuestion, MCQAnswer, RoundResult, SecurityEvent, CompetitionSetting
)
from app.api.deps import get_current_participant

router = APIRouter(prefix="/mcq", tags=["MCQ Assessment"])

class QuestionOut(BaseModel):
    index: int # 1 to 25
    question_id: str
    topic: str
    difficulty: str
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    selected_option: Optional[str] = None # 'A', 'B', 'C', 'D' or None

class AttemptStateResponse(BaseModel):
    attempt_id: str
    status: str # IN_PROGRESS, SUBMITTED, TERMINATED
    started_at: datetime
    duration_seconds: int
    remaining_seconds: int
    questions: List[QuestionOut]
    answered_count: int
    unanswered_count: int
    violations_count: int = 0

class SaveAnswerRequest(BaseModel):
    attempt_id: str
    question_id: str
    selected_option: str # 'A', 'B', 'C', 'D'

class SubmitMCQResponse(BaseModel):
    attempt_id: str
    status: str
    score: int
    total_marks: int
    correct_count: int
    incorrect_count: int
    unanswered_count: int
    is_qualified: bool
    message: str

@router.get("/attempt", response_model=AttemptStateResponse)
async def get_or_start_mcq_attempt(
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Get existing active attempt or initialize a new attempt for Round 1.
    Selects 25 questions for participant's academic year, shuffles once, and PERSISTS order.
    The client NEVER gets correct_option.
    """
    # 1. Fetch Round 1
    r1_res = await db.execute(select(Round).where(Round.round_number == 1))
    round_1 = r1_res.scalar_one_or_none()
    if not round_1 or not round_1.is_open:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Level 1 assessment is currently closed."
        )

    # 2. Check for existing attempt
    att_res = await db.execute(
        select(MCQAttempt).where(
            MCQAttempt.participant_id == current_participant.id,
            MCQAttempt.round_id == round_1.id
        )
    )
    attempt = att_res.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if not attempt:
        # Create new attempt
        attempt = MCQAttempt(
            participant_id=current_participant.id,
            round_id=round_1.id,
            started_at=now,
            duration_seconds=round_1.duration_minutes * 60,
            status="IN_PROGRESS"
        )
        db.add(attempt)
        await db.flush()

        # Fetch questions for participant's academic year
        q_res = await db.execute(
            select(MCQQuestion).where(
                MCQQuestion.academic_year == current_participant.academic_year,
                MCQQuestion.is_active == True
            )
        )
        pool = q_res.scalars().all()
        if len(pool) < 25:
            # Fallback to general pool if year specific has fewer
            all_q_res = await db.execute(select(MCQQuestion).where(MCQQuestion.is_active == True))
            pool = all_q_res.scalars().all()

        if len(pool) < 25:
            selected_pool = pool
        else:
            selected_pool = random.sample(pool, 25)

        # Persist assignment order
        for idx, q in enumerate(selected_pool, start=1):
            aq = MCQAttemptQuestion(
                attempt_id=attempt.id,
                question_id=q.id,
                display_order=idx
            )
            db.add(aq)

        await db.commit()
        await db.refresh(attempt)

    # Calculate remaining time server-side
    started_at = attempt.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    elapsed = int((now - started_at).total_seconds())
    remaining = max(0, attempt.duration_seconds - elapsed)

    # If time expired and still in progress -> force submit server-side
    if remaining <= 0 and attempt.status == "IN_PROGRESS":
        attempt.status = "SUBMITTED"
        attempt.submitted_at = now
        await _score_and_finalize_attempt(attempt, db)
        await db.commit()

    # Load persisted questions in assigned order
    aq_res = await db.execute(
        select(MCQAttemptQuestion, MCQQuestion)
        .join(MCQQuestion, MCQAttemptQuestion.question_id == MCQQuestion.id)
        .where(MCQAttemptQuestion.attempt_id == attempt.id)
        .order_by(MCQAttemptQuestion.display_order.asc())
    )
    rows = aq_res.all()

    # Load participant's saved answers
    ans_res = await db.execute(
        select(MCQAnswer).where(MCQAnswer.attempt_id == attempt.id)
    )
    saved_answers = {a.question_id: a.selected_option for a in ans_res.scalars().all()}

    questions_out: List[QuestionOut] = []
    for aq, q in rows:
        questions_out.append(QuestionOut(
            index=aq.display_order,
            question_id=q.id,
            topic=q.topic,
            difficulty=q.difficulty,
            question_text=q.question_text,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            selected_option=saved_answers.get(q.id)
        ))

    answered = sum(1 for q in questions_out if q.selected_option is not None)
    unanswered = len(questions_out) - answered

    v_res = await db.execute(
        select(func.count(SecurityEvent.id)).where(
            SecurityEvent.attempt_id == attempt.id
        )
    )
    violations_count = v_res.scalar() or 0

    return AttemptStateResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        started_at=attempt.started_at,
        duration_seconds=attempt.duration_seconds,
        remaining_seconds=remaining,
        questions=questions_out,
        answered_count=answered,
        unanswered_count=unanswered,
        violations_count=violations_count
    )

@router.post("/answer")
async def save_answer(
    payload: SaveAnswerRequest,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Lightweight, atomic upsert endpoint for answer selection backed by UNIQUE(attempt_id, question_id).
    Validates attempt ownership and status before writing.
    """
    # Verify attempt
    att_res = await db.execute(
        select(MCQAttempt).where(
            MCQAttempt.id == payload.attempt_id,
            MCQAttempt.participant_id == current_participant.id
        )
    )
    attempt = att_res.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Assessment attempt not found.")

    if attempt.status != "IN_PROGRESS":
        raise HTTPException(status_code=403, detail="Attempt is locked and no longer accepts modifications.")

    # Upsert answer
    ans_res = await db.execute(
        select(MCQAnswer).where(
            MCQAnswer.attempt_id == payload.attempt_id,
            MCQAnswer.question_id == payload.question_id
        )
    )
    existing_ans = ans_res.scalar_one_or_none()

    if existing_ans:
        existing_ans.selected_option = payload.selected_option.upper()
        existing_ans.updated_at = datetime.now(timezone.utc)
    else:
        new_ans = MCQAnswer(
            attempt_id=payload.attempt_id,
            question_id=payload.question_id,
            selected_option=payload.selected_option.upper()
        )
        db.add(new_ans)

    await db.commit()
    return {"status": "saved", "question_id": payload.question_id, "selected_option": payload.selected_option}

@router.post("/submit", response_model=SubmitMCQResponse)
async def submit_mcq_attempt(
    payload: dict,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Lock attempt, score answers server-side, compute qualification (>= 18/25), and write round_results.
    """
    attempt_id = payload.get("attempt_id")
    if not attempt_id:
        raise HTTPException(status_code=400, detail="attempt_id is required")

    att_res = await db.execute(
        select(MCQAttempt).where(
            MCQAttempt.id == attempt_id,
            MCQAttempt.participant_id == current_participant.id
        )
    )
    attempt = att_res.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.status == "SUBMITTED":
        # Already scored
        r_res = await db.execute(
            select(RoundResult).where(
                RoundResult.participant_id == current_participant.id,
                RoundResult.round_id == attempt.round_id
            )
        )
        res = r_res.scalar_one_or_none()
        sc = res.score if res else 0
        return SubmitMCQResponse(
            attempt_id=attempt.id,
            status="SUBMITTED",
            score=sc,
            total_marks=25,
            correct_count=sc,
            incorrect_count=25 - sc,
            unanswered_count=0,
            is_qualified=res.is_qualified if res else False,
            message="Assessment previously submitted."
        )

    attempt.status = "SUBMITTED"
    attempt.submitted_at = datetime.now(timezone.utc)
    score, is_qualified, correct_cnt, incorrect_cnt, unanswered_cnt = await _score_and_finalize_attempt(attempt, db)
    await db.commit()

    return SubmitMCQResponse(
        attempt_id=attempt.id,
        status="SUBMITTED",
        score=score,
        total_marks=25,
        correct_count=correct_cnt,
        incorrect_count=incorrect_cnt,
        unanswered_count=unanswered_cnt,
        is_qualified=is_qualified,
        message="Assessment submitted successfully."
    )

async def _score_and_finalize_attempt(attempt: MCQAttempt, db: AsyncSession):
    # Fetch questions and correct options
    aq_res = await db.execute(
        select(MCQAttemptQuestion.question_id, MCQQuestion.correct_option)
        .join(MCQQuestion, MCQAttemptQuestion.question_id == MCQQuestion.id)
        .where(MCQAttemptQuestion.attempt_id == attempt.id)
    )
    correct_dict = {qid: cor.upper() for qid, cor in aq_res.all()}

    # Fetch answers
    ans_res = await db.execute(
        select(MCQAnswer).where(MCQAnswer.attempt_id == attempt.id)
    )
    user_answers = {a.question_id: a.selected_option for a in ans_res.scalars().all()}

    correct_count = 0
    incorrect_count = 0
    unanswered_count = 0
    for qid, correct in correct_dict.items():
        ans = user_answers.get(qid)
        if ans is None:
            unanswered_count += 1
        elif ans == correct:
            correct_count += 1
        else:
            incorrect_count += 1

    score = correct_count

    # Threshold from settings or default 18
    setting_res = await db.execute(
        select(CompetitionSetting).where(CompetitionSetting.key == "mcq_qualifying_cutoff")
    )
    setting = setting_res.scalar_one_or_none()
    threshold = int(setting.value) if setting else 18
    is_qualified = (score >= threshold)

    # Upsert RoundResult
    res_res = await db.execute(
        select(RoundResult).where(
            RoundResult.participant_id == attempt.participant_id,
            RoundResult.round_id == attempt.round_id
        )
    )
    existing_result = res_res.scalar_one_or_none()
    if existing_result:
        existing_result.score = score
        existing_result.is_qualified = is_qualified
        existing_result.completed_at = datetime.now(timezone.utc)
    else:
        new_result = RoundResult(
            participant_id=attempt.participant_id,
            round_id=attempt.round_id,
            score=score,
            is_qualified=is_qualified
        )
        db.add(new_result)

    return score, is_qualified, correct_count, incorrect_count, unanswered_count
