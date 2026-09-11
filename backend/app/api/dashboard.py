from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.db.session import get_db
from app.db.models import (
    Participant, Round, MCQAttempt, CodingAttempt, 
    RoundResult, SecurityEvent, CodingSubmission, PresentationEvaluation
)
from app.api.deps import get_current_participant
from app.schemas.dashboard import (
    DashboardStateResponse, ParticipantState, RoundInfo, ResultSummary,
    ParticipantMarksResponse
)
from app.core.cache import memory_cache

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/state", response_model=DashboardStateResponse)
async def get_dashboard_state(
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Compute and return server-authoritative state for participant dashboard.
    The frontend NEVER computes or assumes this state client-side.
    """
    participant_id = current_participant.id

    # 1. Fetch Rounds (with in-memory cache)
    cached_rounds = memory_cache.get("all_rounds_dict")
    if cached_rounds is None:
        rounds_res = await db.execute(select(Round).order_by(Round.round_number.asc()))
        rounds = rounds_res.scalars().all()
        cached_rounds = [
            {
                "id": r.id,
                "round_number": r.round_number,
                "name": r.name,
                "is_open": r.is_open,
                "duration_minutes": r.duration_minutes
            }
            for r in rounds
        ]
        memory_cache.set("all_rounds_dict", cached_rounds, ttl_seconds=3.0)

    round_1_dict = next((r for r in cached_rounds if r["round_number"] == 1), None)
    round_2_dict = next((r for r in cached_rounds if r["round_number"] == 2), None)

    round_1_info = RoundInfo(
        round_id=round_1_dict["id"],
        round_number=1,
        name=round_1_dict["name"],
        is_open=round_1_dict["is_open"],
        duration_minutes=round_1_dict["duration_minutes"]
    ) if round_1_dict else None

    round_2_info = RoundInfo(
        round_id=round_2_dict["id"],
        round_number=2,
        name=round_2_dict["name"],
        is_open=round_2_dict["is_open"],
        duration_minutes=round_2_dict["duration_minutes"]
    ) if round_2_dict else None

    # 2. Check MCQ Attempt (Round 1)
    mcq_attempt = None
    if round_1_dict:
        att_res = await db.execute(
            select(MCQAttempt).where(
                MCQAttempt.participant_id == participant_id,
                MCQAttempt.round_id == round_1_dict["id"]
            )
        )
        mcq_attempt = att_res.scalar_one_or_none()

    # 3. Check Coding Attempt (Round 2)
    coding_attempt = None
    if round_2_dict:
        c_att_res = await db.execute(
            select(CodingAttempt).where(
                CodingAttempt.participant_id == participant_id,
                CodingAttempt.round_id == round_2_dict["id"]
            )
        )
        coding_attempt = c_att_res.scalar_one_or_none()

    # 4. Check Security Violations
    violations_count = 0
    if mcq_attempt:
        v_res = await db.execute(
            select(func.count(SecurityEvent.id)).where(
                SecurityEvent.attempt_id == mcq_attempt.id
            )
        )
        violations_count = v_res.scalar_one() or 0

    # 5. Check Results & Compute Real-Time Coding Scores
    results_res = await db.execute(
        select(RoundResult).where(RoundResult.participant_id == participant_id)
    )
    all_results = results_res.scalars().all()
    r1_result = next((r for r in all_results if round_1_dict and r.round_id == round_1_dict["id"]), None)
    r2_result = next((r for r in all_results if round_2_dict and r.round_id == round_2_dict["id"]), None)

    # Real-time aggregation of coding submissions
    coding_score_live = 0
    if coding_attempt:
        sub_res = await db.execute(
            select(func.max(CodingSubmission.score))
            .where(CodingSubmission.attempt_id == coding_attempt.id)
            .group_by(CodingSubmission.problem_id)
        )
        coding_score_live = sum(row[0] or 0 for row in sub_res.all())

        # Self-heal RoundResult so leaderboard and dashboard always have authoritative scores
        if round_2_dict:
            eff_score = max(r2_result.score if r2_result else 0, coding_score_live)
            is_done = (coding_attempt.status == "SUBMITTED")
            if not r2_result:
                r2_result = RoundResult(
                    participant_id=participant_id,
                    round_id=round_2_dict["id"],
                    score=eff_score,
                    is_qualified=is_done
                )
                db.add(r2_result)
                await db.commit()
                await db.refresh(r2_result)
            elif eff_score > r2_result.score or (is_done and not r2_result.is_qualified):
                r2_result.score = eff_score
                if is_done:
                    r2_result.is_qualified = True
                await db.commit()
                await db.refresh(r2_result)

    # Participant-facing summary: do not expose raw marks or qualification status
    is_direct_admin_qual = bool(
        r1_result and r1_result.is_qualified and (not mcq_attempt or mcq_attempt.status != "SUBMITTED")
    )
    l1_summary = ResultSummary(
        round_number=1,
        score=0,
        total_marks=25,
        is_qualified=False,
        status_label="Directly Qualified" if is_direct_admin_qual else "Submitted"
    ) if r1_result else None

    l2_summary = ResultSummary(
        round_number=2,
        score=0,
        total_marks=45,
        is_qualified=False,
        status_label="Submitted" if (coding_attempt and coding_attempt.status == "SUBMITTED") else ("In Progress" if coding_attempt else "Locked")
    ) if (r2_result or coding_attempt) else None

    # 6. Evaluate State Machine (per architecture.md §4)
    # Check if Terminated
    is_terminated = (
        (mcq_attempt and mcq_attempt.status == "TERMINATED") or
        (coding_attempt and coding_attempt.status == "TERMINATED") or
        violations_count >= 5
    )

    if is_terminated:
        return DashboardStateResponse(
            participant_name=current_participant.name,
            roll_number=current_participant.roll_number,
            academic_year=current_participant.academic_year,
            email=current_participant.email,
            state=ParticipantState.TERMINATED,
            state_headline="Assessment Disqualified",
            state_description="Your assessment attempt has been locked due to exceeding permitted security policy violations. Contact proctor.",
            can_start_level1=False,
            can_resume_level1=False,
            can_start_level2=False,
            can_resume_level2=False,
            level1_round=round_1_info,
            level2_round=round_2_info,
            level1_result=l1_summary,
            level2_result=l2_summary,
            violations_count=violations_count
        )

    # Coding Round (Round 2) evaluation
    if coding_attempt:
        if coding_attempt.status == "SUBMITTED":
            return DashboardStateResponse(
                participant_name=current_participant.name,
                roll_number=current_participant.roll_number,
                academic_year=current_participant.academic_year,
                email=current_participant.email,
                state=ParticipantState.COMPLETED,
                state_headline="Assessments Submitted",
                state_description="You have submitted your assessments. Shortlisted candidates will be notified regarding qualification and next steps via registered email or the official group.",
                can_start_level1=False,
                can_resume_level1=False,
                can_start_level2=False,
                can_resume_level2=False,
                current_level2_attempt_id=coding_attempt.id,
                level1_round=round_1_info,
                level2_round=round_2_info,
                level1_result=l1_summary,
                level2_result=l2_summary,
                violations_count=violations_count
            )
        elif coding_attempt.status == "IN_PROGRESS":
            return DashboardStateResponse(
                participant_name=current_participant.name,
                roll_number=current_participant.roll_number,
                academic_year=current_participant.academic_year,
                email=current_participant.email,
                state=ParticipantState.LEVEL2_IN_PROGRESS,
                state_headline="Level 2 In Progress",
                state_description="Your coding assessment session is currently active. Click below to return to the editor.",
                can_start_level1=False,
                can_resume_level1=False,
                can_start_level2=False,
                can_resume_level2=True,
                current_level2_attempt_id=coding_attempt.id,
                level1_round=round_1_info,
                level2_round=round_2_info,
                level1_result=l1_summary,
                level2_result=l2_summary,
                violations_count=violations_count
            )

    # Qualified for Level 2 (MCQ cutoff or direct admin qualification)
    # The candidate does NOT need to take Level 1!
    if r1_result and r1_result.is_qualified:
        if round_2_dict and (round_2_dict["is_open"] or is_direct_admin_qual):
            headline = "Directly Qualified for Level 2" if is_direct_admin_qual else "Level 2 Assessment Available"
            desc = (
                "You have been directly qualified for Level 2 by the administrator and do not need to take Level 1. Click below to begin your assessment session."
                if is_direct_admin_qual
                else "Level 2 (Debugging Challenge) is now open. Click below to begin your assessment session."
            )
            return DashboardStateResponse(
                participant_name=current_participant.name,
                roll_number=current_participant.roll_number,
                academic_year=current_participant.academic_year,
                email=current_participant.email,
                state=ParticipantState.LEVEL2_AVAILABLE,
                state_headline=headline,
                state_description=desc,
                can_start_level1=False,
                can_resume_level1=False,
                can_start_level2=True,
                can_resume_level2=False,
                level1_round=round_1_info,
                level2_round=round_2_info,
                level1_result=l1_summary,
                level2_result=l2_summary,
                violations_count=violations_count
            )
        else:
            headline = "Assessment Submitted"
            desc = "Your responses have been recorded. The list of qualified participants for Round 2 will be announced in the official group."
            return DashboardStateResponse(
                participant_name=current_participant.name,
                roll_number=current_participant.roll_number,
                academic_year=current_participant.academic_year,
                email=current_participant.email,
                state=ParticipantState.WAITING_FOR_LEVEL2,
                state_headline=headline,
                state_description=desc,
                can_start_level1=False,
                can_resume_level1=False,
                can_start_level2=False,
                can_resume_level2=False,
                level1_round=round_1_info,
                level2_round=round_2_info,
                level1_result=l1_summary,
                level2_result=l2_summary,
                violations_count=violations_count
            )

    # MCQ Round (Round 1) evaluation for un-qualified candidates
    if mcq_attempt:
        if mcq_attempt.status == "IN_PROGRESS":
            return DashboardStateResponse(
                participant_name=current_participant.name,
                roll_number=current_participant.roll_number,
                academic_year=current_participant.academic_year,
                email=current_participant.email,
                state=ParticipantState.LEVEL1_IN_PROGRESS,
                state_headline="Level 1 In Progress",
                state_description="Your MCQ assessment is active. Return to the assessment to complete before the timer expires.",
                can_start_level1=False,
                can_resume_level1=True,
                can_start_level2=False,
                can_resume_level2=False,
                current_level1_attempt_id=mcq_attempt.id,
                level1_round=round_1_info,
                level2_round=round_2_info,
                level1_result=l1_summary,
                level2_result=l2_summary,
                violations_count=violations_count
            )
        
        if mcq_attempt.status == "SUBMITTED":
            return DashboardStateResponse(
                participant_name=current_participant.name,
                roll_number=current_participant.roll_number,
                academic_year=current_participant.academic_year,
                email=current_participant.email,
                state=ParticipantState.NOT_QUALIFIED,
                state_headline="Assessment Submitted",
                state_description="Your responses have been recorded. The list of qualified participants for Round 2 will be announced in the official group.",
                can_start_level1=False,
                can_resume_level1=False,
                can_start_level2=False,
                can_resume_level2=False,
                level1_round=round_1_info,
                level2_round=round_2_info,
                level1_result=l1_summary,
                level2_result=l2_summary,
                violations_count=violations_count
            )

    # No attempt yet
    if round_1_dict and round_1_dict["is_open"]:
        return DashboardStateResponse(
            participant_name=current_participant.name,
            roll_number=current_participant.roll_number,
            academic_year=current_participant.academic_year,
            email=current_participant.email,
            state=ParticipantState.LEVEL1_AVAILABLE,
            state_headline="Level 1 Assessment Available",
            state_description="Level 1 (MCQ Assessment) is currently open. You have 25 questions in 30 minutes. Please begin when ready.",
            can_start_level1=True,
            can_resume_level1=False,
            can_start_level2=False,
            can_resume_level2=False,
            level1_round=round_1_info,
            level2_round=round_2_info,
            level1_result=None,
            level2_result=None,
            violations_count=0
        )
    else:
        return DashboardStateResponse(
            participant_name=current_participant.name,
            roll_number=current_participant.roll_number,
            academic_year=current_participant.academic_year,
            email=current_participant.email,
            state=ParticipantState.LEVEL1_AVAILABLE,
            state_headline="Assessment Not Started",
            state_description="Level 1 has not yet been opened by the competition organizers. Please wait for official announcement.",
            can_start_level1=False,
            can_resume_level1=False,
            can_start_level2=False,
            can_resume_level2=False,
            level1_round=round_1_info,
            level2_round=round_2_info,
            level1_result=None,
            level2_result=None,
            violations_count=0
        )


@router.get("/marks", response_model=ParticipantMarksResponse)
async def get_participant_marks(
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    """
    Fetch comprehensive marks breakdown for the logged-in participant across all rounds.
    Includes MCQ (/25), Debugging (/45), Presentation/Viva (/30), Grand Total (/100), Rank, and Status.
    """
    participant_id = current_participant.id

    # 1. Fetch Rounds
    rounds = (await db.execute(select(Round).order_by(Round.round_number.asc()))).scalars().all()
    r1 = next((r for r in rounds if r.round_number == 1), None)
    r2 = next((r for r in rounds if r.round_number == 2), None)

    # 2. Fetch RoundResults for candidate
    rr_res = await db.execute(
        select(RoundResult).where(RoundResult.participant_id == participant_id)
    )
    all_rr = {r.round_id: r for r in rr_res.scalars().all()}
    
    r1_rr = all_rr.get(r1.id) if r1 else None
    r2_rr = all_rr.get(r2.id) if r2 else None

    # 3. MCQ Status & Score
    mcq_score = r1_rr.score if r1_rr else None
    if r1_rr and r1_rr.is_qualified and (mcq_score is None or mcq_score == 0):
        mcq_att_res = await db.execute(
            select(MCQAttempt).where(MCQAttempt.participant_id == participant_id)
        )
        mcq_att = mcq_att_res.scalar_one_or_none()
        if not mcq_att or mcq_att.status != "SUBMITTED":
            mcq_status = "Directly Qualified (Exempted)"
        else:
            mcq_status = "Completed"
    elif r1_rr:
        mcq_status = "Completed"
    else:
        mcq_status = "Not Attempted"

    # 4. Coding / Debugging Score
    coding_att_res = await db.execute(
        select(CodingAttempt).where(CodingAttempt.participant_id == participant_id)
    )
    coding_att = coding_att_res.scalar_one_or_none()
    
    coding_score_live = 0
    if coding_att:
        sub_res = await db.execute(
            select(func.max(CodingSubmission.score))
            .where(CodingSubmission.attempt_id == coding_att.id)
            .group_by(CodingSubmission.problem_id)
        )
        coding_score_live = sum(row[0] or 0 for row in sub_res.all())

    if r2_rr:
        coding_score = max(r2_rr.score, coding_score_live)
        coding_score = min(coding_score, 45) # Capped at 45
        coding_status = "Completed"
    elif coding_att:
        coding_score = min(coding_score_live, 45)
        coding_status = "In Progress" if coding_att.status == "IN_PROGRESS" else "Submitted"
    else:
        coding_score = None
        coding_status = "Not Unlocked"

    total_eval_score = (mcq_score or 0) + (coding_score or 0)

    # 5. Overall Rank Calculation
    all_parts = (await db.execute(select(Participant))).scalars().all()
    all_results = (await db.execute(select(RoundResult))).scalars().all()
    
    scores_per_participant = {p.id: 0 for p in all_parts}

    for rr in all_results:
        if rr.round_id in (r1.id if r1 else "", r2.id if r2 else ""):
            scores_per_participant[rr.participant_id] = scores_per_participant.get(rr.participant_id, 0) + rr.score

    sorted_p_ids = sorted(scores_per_participant.keys(), key=lambda pid: scores_per_participant[pid], reverse=True)
    
    p_rank = None
    if participant_id in sorted_p_ids and (mcq_score is not None or coding_score is not None):
        p_rank = sorted_p_ids.index(participant_id) + 1

    # 6. Qualification Status Label
    if r2_rr and r2_rr.is_qualified:
        qual_status = "Qualified for Round 3 Presentation & Viva"
    elif r1_rr and r1_rr.is_qualified:
        qual_status = "Qualified for Round 2 Debugging"
    elif r1_rr or coding_att:
        qual_status = "Assessment Completed (Under Review)"
    else:
        qual_status = "Registered Participant"

    return ParticipantMarksResponse(
        participant_name=current_participant.name,
        roll_number=current_participant.roll_number,
        academic_year=current_participant.academic_year,
        email=current_participant.email,
        mcq_score=mcq_score,
        mcq_max_marks=25,
        mcq_status=mcq_status,
        coding_score=coding_score,
        coding_max_marks=45,
        coding_status=coding_status,
        total_score=total_eval_score,
        max_total_marks=70,
        rank=p_rank,
        total_participants=len(all_parts),
        qualification_status=qual_status
    )

