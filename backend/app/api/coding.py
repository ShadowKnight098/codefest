import random
import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.db.models import (
    Participant, Round, CodingAttempt, RoundResult, CompetitionSetting,
    SecurityEvent, L2Question, L2QuestionAssignment, L2Answer, MCQAttempt
)
from app.api.deps import get_current_participant
from app.core.cache import memory_cache

router = APIRouter(prefix="/coding", tags=["Level 2 Debugging Challenge"])

# ─── Schemas ───

class L2QuestionItemOut(BaseModel):
    id: str
    question_id: str
    position: int
    language: str
    difficulty: str
    question: str
    code: str
    options: Dict[str, str]  # {"a": text, "b": text, "c": text, "d": text}
    option_keys: List[str]   # Shuffled or sequential keys e.g. ["a", "b", "c", "d"]
    marks: int
    selected_option: Optional[str] = None  # Participant's saved choice ('a','b','c','d') or None

class L2AttemptResponse(BaseModel):
    attempt_id: str
    status: str
    remaining_seconds: int
    duration_seconds: int
    questions: List[L2QuestionItemOut]
    violations_count: int = 0
    total_questions: int = 0
    answered_count: int = 0

class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_option: Optional[str] = None  # 'a', 'b', 'c', 'd' or None/empty to deselect

class SaveAnswerResponse(BaseModel):
    status: str
    question_id: str
    selected_option: Optional[str]

class FinalSubmitRequest(BaseModel):
    attempt_id: Optional[str] = None

class FinalSubmitResponse(BaseModel):
    attempt_id: str
    status: str
    total_score: int
    total_marks: int
    answered_count: int
    total_questions: int
    message: str


# ─── Helper Functions ───

async def _score_and_finalize_attempt(attempt: CodingAttempt, participant_id: str, db: AsyncSession):
    """Authoritative server-side grading for Level 2 Debugging Challenge."""
    assign_res = await db.execute(
        select(L2QuestionAssignment)
        .where(L2QuestionAssignment.participant_id == participant_id)
        .order_by(L2QuestionAssignment.position.asc())
    )
    assignments = assign_res.scalars().all()

    q_ids = [a.question_id for a in assignments]
    questions_res = await db.execute(select(L2Question).where(L2Question.id.in_(q_ids)))
    questions_map = {q.id: q for q in questions_res.scalars().all()}

    answers_res = await db.execute(
        select(L2Answer).where(
            L2Answer.participant_id == participant_id,
            L2Answer.question_id.in_(q_ids)
        )
    )
    answers_map = {a.question_id: a for a in answers_res.scalars().all()}

    total_score = 0
    total_marks = 0
    answered_count = 0

    for a in assignments:
        q = questions_map.get(a.question_id)
        if not q:
            continue
        total_marks += q.marks
        ans = answers_map.get(a.question_id)
        if ans and ans.selected_option and ans.selected_option.strip():
            answered_count += 1
            if ans.selected_option.strip().lower() == q.correct_answer.strip().lower():
                total_score += q.marks

    attempt.status = "SUBMITTED"
    attempt.submitted_at = datetime.now(timezone.utc)
    attempt.score = total_score

    # Sync RoundResult for Round 2
    round_2 = (await db.execute(select(Round).where(Round.round_number == 2))).scalar_one_or_none()
    if round_2:
        rr_check = await db.execute(
            select(RoundResult).where(
                RoundResult.participant_id == participant_id,
                RoundResult.round_id == round_2.id
            )
        )
        existing_rr = rr_check.scalar_one_or_none()
        if existing_rr:
            existing_rr.score = total_score
        else:
            db.add(RoundResult(
                participant_id=participant_id,
                round_id=round_2.id,
                score=total_score,
                is_qualified=False
            ))

    await db.commit()
    memory_cache.delete("admin_leaderboard")
    memory_cache.delete("admin_live_stats")

    return total_score, total_marks, answered_count, len(assignments)


# ─── Endpoints ───

@router.get("/attempt", response_model=L2AttemptResponse)
async def get_or_start_l2_attempt(
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Get or start Level 2 Debugging / Missing-Line Challenge attempt.
    - Strictly blocks Academic Years 1 and 4.
    - Enforces Round 2 open status and Round 1 qualification.
    - Quota-based sampling without replacement across easy, medium, hard buckets.
    - Persists assignments so subsequent loads and refreshes never re-randomize.
    - NEVER exposes correct_answer to the client.
    """
    # 1. Eligibility Check (Academic Years 2 & 3 only)
    if current_participant.academic_year not in (2, 3):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Level 2 Debugging Challenge is open only to Academic Years 2 and 3."
        )

    # 2. Check qualification from Round 1
    round_1 = (await db.execute(select(Round).where(Round.round_number == 1).limit(1))).scalar_one_or_none()
    is_direct_admin_qual = False
    if round_1:
        result_query = await db.execute(
            select(RoundResult).where(
                RoundResult.participant_id == current_participant.id,
                RoundResult.round_id == round_1.id,
                RoundResult.is_qualified == True
            ).limit(1)
        )
        r1_result = result_query.scalars().first()
        if not r1_result:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Participant has not qualified for Level 2."
            )

        # Check if directly qualified by admin (no submitted MCQ attempt)
        mcq_att_res = await db.execute(
            select(MCQAttempt).where(
                MCQAttempt.participant_id == current_participant.id,
                MCQAttempt.round_id == round_1.id
            ).limit(1)
        )
        mcq_att = mcq_att_res.scalars().first()
        if not mcq_att or mcq_att.status != "SUBMITTED":
            is_direct_admin_qual = True

    # 3. Check if Round 2 is open (or participant is directly qualified by admin)
    round_res = await db.execute(select(Round).where(Round.round_number == 2).limit(1))
    round_2 = round_res.scalar_one_or_none()
    if not round_2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Level 02 configuration not found."
        )
    if not round_2.is_open and not is_direct_admin_qual:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Level 02 · Debugging Challenge is not currently open."
        )

    # 4. Determine assessment duration
    duration_setting = await db.execute(
        select(CompetitionSetting.value).where(CompetitionSetting.key == "coding_duration_seconds")
    )
    val = duration_setting.scalar_one_or_none()
    duration_sec = int(val) if val else round_2.duration_minutes * 60

    # 5. Fetch or initialize CodingAttempt
    now = datetime.now(timezone.utc)
    att_res = await db.execute(
        select(CodingAttempt).where(
            CodingAttempt.participant_id == current_participant.id,
            CodingAttempt.round_id == round_2.id
        )
    )
    attempt = att_res.scalar_one_or_none()

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

    # Calculate remaining time
    started_at = attempt.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)

    if attempt.status in ("SUBMITTED", "TERMINATED"):
        remaining = 0
    else:
        elapsed = (now - started_at).total_seconds()
        remaining = max(0, int(attempt.duration_seconds - elapsed))

    # Auto-finalize if expired
    if remaining == 0 and attempt.status == "IN_PROGRESS":
        await _score_and_finalize_attempt(attempt, current_participant.id, db)
        await db.refresh(attempt)

    # STRICT LOCKOUT: If attempt is submitted or terminated, NEVER serve question pool or code
    if attempt.status in ("SUBMITTED", "TERMINATED") or remaining <= 0:
        v_res = await db.execute(
            select(func.count(SecurityEvent.id)).where(
                SecurityEvent.attempt_id == attempt.id
            )
        )
        violations_count = v_res.scalar() or 0

        # Count answered questions from database
        ans_count_res = await db.execute(
            select(func.count(L2Answer.id)).where(
                L2Answer.participant_id == current_participant.id,
                L2Answer.selected_option.isnot(None)
            )
        )
        ans_c = ans_count_res.scalar() or 0

        tot_q_res = await db.execute(
            select(func.count(L2QuestionAssignment.id)).where(
                L2QuestionAssignment.participant_id == current_participant.id
            )
        )
        tot_q = tot_q_res.scalar() or 15

        return L2AttemptResponse(
            attempt_id=attempt.id,
            status=attempt.status if attempt.status in ("SUBMITTED", "TERMINATED") else "SUBMITTED",
            remaining_seconds=0,
            duration_seconds=attempt.duration_seconds,
            questions=[],
            violations_count=violations_count,
            total_questions=tot_q,
            answered_count=ans_c
        )

    # 6. Fetch or Generate Question Assignments
    assign_res = await db.execute(
        select(L2QuestionAssignment)
        .where(L2QuestionAssignment.participant_id == current_participant.id)
        .order_by(L2QuestionAssignment.position.asc())
    )
    assignments = assign_res.scalars().all()

    if not assignments:
        # Fetch quota settings (defaults: 3 Easy, 3 Medium, 2 Hard)
        q_easy_setting = await db.execute(
            select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_easy")
        )
        q_med_setting = await db.execute(
            select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_medium")
        )
        q_hard_setting = await db.execute(
            select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_hard")
        )

        val_e = q_easy_setting.scalar_one_or_none()
        val_m = q_med_setting.scalar_one_or_none()
        val_h = q_hard_setting.scalar_one_or_none()

        quota_easy = int(val_e) if val_e and int(val_e) > 0 else 5
        quota_medium = int(val_m) if val_m and int(val_m) > 0 else 5
        quota_hard = int(val_h) if val_h and int(val_h) > 0 else 5

        # 1. Pull eligible pool for participant's academic year (fallback to academic_year IN (2, 3))
        pool_res = await db.execute(
            select(L2Question).where(
                L2Question.academic_year == current_participant.academic_year,
                L2Question.is_active == True
            )
        )
        pool = pool_res.scalars().all()

        # If year-specific pool does not meet quotas, pull from combined Year 2 & 3 pool per spec
        easy_pool = [q for q in pool if q.difficulty.lower() == "easy"]
        med_pool = [q for q in pool if q.difficulty.lower() == "medium"]
        hard_pool = [q for q in pool if q.difficulty.lower() == "hard"]

        if len(easy_pool) < quota_easy or len(med_pool) < quota_medium or len(hard_pool) < quota_hard:
            combined_pool_res = await db.execute(
                select(L2Question).where(
                    L2Question.academic_year.in_([2, 3]),
                    L2Question.is_active == True
                )
            )
            pool = combined_pool_res.scalars().all()
            easy_pool = [q for q in pool if q.difficulty.lower() == "easy"]
            med_pool = [q for q in pool if q.difficulty.lower() == "medium"]
            hard_pool = [q for q in pool if q.difficulty.lower() == "hard"]

        # Pre-flight Check: verify each bucket has at least the required quota
        missing = []
        if len(easy_pool) < quota_easy:
            missing.append(f"Easy (need {quota_easy}, found {len(easy_pool)})")
        if len(med_pool) < quota_medium:
            missing.append(f"Medium (need {quota_medium}, found {len(med_pool)})")
        if len(hard_pool) < quota_hard:
            missing.append(f"Hard (need {quota_hard}, found {len(hard_pool)})")

        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question pool quota not met. Missing required questions: {', '.join(missing)}. Please notify the administrator."
            )

        # 4. Randomly sample the quota amount from each bucket without replacement
        sampled_easy = random.sample(easy_pool, quota_easy)
        sampled_med = random.sample(med_pool, quota_medium)
        sampled_hard = random.sample(hard_pool, quota_hard)

        # 5. Combine and shuffle final order
        combined_selection = sampled_easy + sampled_med + sampled_hard
        random.shuffle(combined_selection)

        # 6. Persist assigned set + order to question_assignments
        for idx, q in enumerate(combined_selection, start=1):
            opt_keys = ["a", "b", "c", "d"]
            random.shuffle(opt_keys)
            db.add(L2QuestionAssignment(
                participant_id=current_participant.id,
                question_id=q.id,
                position=idx,
                difficulty=q.difficulty.lower(),
                option_order=json.dumps(opt_keys)
            ))

        await db.commit()

        # Re-read persisted assignments
        assign_res = await db.execute(
            select(L2QuestionAssignment)
            .where(L2QuestionAssignment.participant_id == current_participant.id)
            .order_by(L2QuestionAssignment.position.asc())
        )
        assignments = assign_res.scalars().all()

    # 7. Build question list with stripped correct_answer
    q_ids = [a.question_id for a in assignments]
    questions_res = await db.execute(select(L2Question).where(L2Question.id.in_(q_ids)))
    questions_map = {q.id: q for q in questions_res.scalars().all()}

    answers_res = await db.execute(
        select(L2Answer).where(
            L2Answer.participant_id == current_participant.id,
            L2Answer.question_id.in_(q_ids)
        )
    )
    answers_map = {a.question_id: a.selected_option for a in answers_res.scalars().all()}

    question_items: List[L2QuestionItemOut] = []
    for a in assignments:
        q = questions_map.get(a.question_id)
        if not q:
            continue

        raw_options = {
            "a": q.option_a,
            "b": q.option_b,
            "c": q.option_c,
            "d": q.option_d
        }

        try:
            opt_keys = json.loads(a.option_order) if a.option_order else ["a", "b", "c", "d"]
        except Exception:
            opt_keys = ["a", "b", "c", "d"]

        ordered_options = {k: raw_options.get(k, "") for k in opt_keys}

        question_items.append(L2QuestionItemOut(
            id=q.id,
            question_id=q.question_id,
            position=a.position,
            language=q.language,
            difficulty=q.difficulty,
            question=q.question,
            code=q.code,
            options=ordered_options,
            option_keys=opt_keys,
            marks=q.marks,
            selected_option=answers_map.get(q.id)
        ))

    # Violations count
    v_res = await db.execute(
        select(func.count(SecurityEvent.id)).where(
            SecurityEvent.attempt_id == attempt.id
        )
    )
    violations_count = v_res.scalar() or 0

    answered_count = sum(1 for q in question_items if q.selected_option)

    return L2AttemptResponse(
        attempt_id=attempt.id,
        status=attempt.status,
        remaining_seconds=remaining,
        duration_seconds=attempt.duration_seconds,
        questions=question_items,
        violations_count=violations_count,
        total_questions=len(question_items),
        answered_count=answered_count
    )


@router.post("/answer", response_model=SaveAnswerResponse)
async def save_l2_answer(
    payload: SaveAnswerRequest,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Auto-save participant's selected option on click.
    Option selection is saved immediately to `l2_answers`.
    """
    # Verify participant has an active attempt
    att_res = await db.execute(
        select(CodingAttempt).where(
            CodingAttempt.participant_id == current_participant.id
        ).order_by(CodingAttempt.started_at.desc())
    )
    attempt = att_res.scalar_one_or_none()
    if not attempt or attempt.status in ("SUBMITTED", "TERMINATED"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assessment attempt is already submitted or terminated."
        )

    # Server-side timer check (with 30s grace)
    started = attempt.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    if elapsed > attempt.duration_seconds + 30:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Time limit has expired. Answers can no longer be saved."
        )

    # Verify question is assigned to this participant (payload.question_id could be L2Question.id or question_id)
    assign_res = await db.execute(
        select(L2QuestionAssignment, L2Question.id)
        .join(L2Question, L2QuestionAssignment.question_id == L2Question.id)
        .where(
            L2QuestionAssignment.participant_id == current_participant.id,
            (L2Question.id == payload.question_id) | (L2Question.question_id == payload.question_id)
        )
    )
    assignment_match = assign_res.first()
    if not assignment_match:
        raise HTTPException(status_code=404, detail="Question is not assigned to your assessment.")

    db_question_id = assignment_match[1]
    selected = payload.selected_option.strip().lower() if payload.selected_option and payload.selected_option.strip() else None
    if selected and selected not in ('a', 'b', 'c', 'd'):
        raise HTTPException(status_code=400, detail="Invalid option selection. Must be one of: a, b, c, d.")

    # Upsert answer
    ans_res = await db.execute(
        select(L2Answer).where(
            L2Answer.participant_id == current_participant.id,
            L2Answer.question_id == db_question_id
        )
    )
    ans = ans_res.scalar_one_or_none()

    if ans:
        ans.selected_option = selected
        ans.saved_at = datetime.now(timezone.utc)
    else:
        ans = L2Answer(
            participant_id=current_participant.id,
            question_id=db_question_id,
            selected_option=selected,
            saved_at=datetime.now(timezone.utc)
        )
        db.add(ans)

    await db.commit()

    return SaveAnswerResponse(
        status="saved",
        question_id=payload.question_id,
        selected_option=selected
    )


@router.api_route("/submit", methods=["POST", "PUT"], response_model=FinalSubmitResponse)
@router.api_route("/final-submit", methods=["POST", "PUT"], response_model=FinalSubmitResponse)
@router.api_route("/final-submit/", methods=["POST", "PUT"], response_model=FinalSubmitResponse)
async def submit_l2_assessment(
    payload: Optional[FinalSubmitRequest] = None,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Finalize Level 2 Debugging / Missing-Line Challenge.
    Authoritative server-side grading computes score directly from `l2_answers` vs `l2_questions.correct_answer`.
    Records score into `coding_attempts.score` and updates `round_results`.
    """
    # Fetch participant's attempt
    att_res = await db.execute(
        select(CodingAttempt).where(
            CodingAttempt.participant_id == current_participant.id
        ).order_by(CodingAttempt.started_at.desc())
    )
    attempt = att_res.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Active Level 2 attempt not found.")

    if attempt.status == "SUBMITTED":
        # Already submitted: return current score
        assign_res = await db.execute(
            select(func.count(L2QuestionAssignment.id))
            .where(L2QuestionAssignment.participant_id == current_participant.id)
        )
        tot_q = assign_res.scalar() or 0
        ans_res = await db.execute(
            select(func.count(L2Answer.id))
            .where(
                L2Answer.participant_id == current_participant.id,
                L2Answer.selected_option.isnot(None)
            )
        )
        ans_c = ans_res.scalar() or 0

        # Calculate max possible marks
        assigns = (await db.execute(
            select(L2Question.marks)
            .join(L2QuestionAssignment, L2QuestionAssignment.question_id == L2Question.id)
            .where(L2QuestionAssignment.participant_id == current_participant.id)
        )).scalars().all()
        total_marks = sum(assigns)

        return FinalSubmitResponse(
            attempt_id=attempt.id,
            status="SUBMITTED",
            total_score=attempt.score or 0,
            total_marks=total_marks,
            answered_count=ans_c,
            total_questions=tot_q,
            message="Level 2 Debugging Assessment already submitted."
        )

    total_score, total_marks, answered_count, total_questions = await _score_and_finalize_attempt(
        attempt, current_participant.id, db
    )

    return FinalSubmitResponse(
        attempt_id=attempt.id,
        status="SUBMITTED",
        total_score=total_score,
        total_marks=total_marks,
        answered_count=answered_count,
        total_questions=total_questions,
        message="Level 2 Debugging Assessment submitted successfully."
    )
