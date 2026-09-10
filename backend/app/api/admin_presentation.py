from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.db.session import get_db
from app.db.models import (
    Participant, Round, RoundResult, PresentationEvaluation, 
    CodingAttempt, CodingSubmission, AdminUser
)
from app.api.deps import get_current_admin
from app.core.cache import memory_cache

router = APIRouter(prefix="/admin/presentation", tags=["Admin Presentation Evaluation"])

class EvaluationRequest(BaseModel):
    participant_id: str
    presentation_score: int = Field(0, ge=0, le=10, description="Presentation & communication skills (0-10)")
    technical_score: int = Field(0, ge=0, le=10, description="Code defense & complexity analysis (0-10)")
    viva_score: int = Field(0, ge=0, le=10, description="Viva Q&A & conceptual depth (0-10)")
    remarks: Optional[str] = None

class EvaluationDetail(BaseModel):
    id: str
    presentation_score: int
    technical_score: int
    viva_score: int
    total_score: int
    remarks: Optional[str] = None
    evaluator_name: Optional[str] = None
    created_at: str

class FinalistOut(BaseModel):
    participant_id: str
    roll_number: str
    name: str
    email: str
    academic_year: int
    mcq_score: Optional[int] = None
    coding_score: Optional[int] = None
    total_previous_score: int = 0
    grand_total_score: int = 0
    status: str # "PENDING" or "EVALUATED"
    evaluation: Optional[EvaluationDetail] = None

class BulkPromoteRequest(BaseModel):
    participant_ids: Optional[List[str]] = None
    min_coding_score: Optional[int] = None
    top_n: Optional[int] = None

@router.api_route("/finalists", methods=["GET"])
@router.api_route("/finalists/", methods=["GET"])
async def get_presentation_finalists(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
) -> List[FinalistOut]:
    """
    Returns all participants qualified from Level 2 (or promoted),
    together with their evaluation status and scores.
    """
    # 1. Fetch Rounds
    rounds = (await db.execute(select(Round).order_by(Round.round_number.asc()))).scalars().all()
    r1 = next((r for r in rounds if r.round_number == 1), None)
    r2 = next((r for r in rounds if r.round_number == 2), None)
    r3 = next((r for r in rounds if r.round_number == 3), None)

    # 2. Find participants qualified from Round 2 (or who have PresentationEvaluation)
    r2_qual_ids = set()
    if r2:
        r2_res = await db.execute(
            select(RoundResult.participant_id).where(
                RoundResult.round_id == r2.id,
                RoundResult.is_qualified == True
            )
        )
        r2_qual_ids = {row[0] for row in r2_res.all()}

    # Also include any participant who already has an evaluation
    evals_res = await db.execute(select(PresentationEvaluation))
    evals = evals_res.scalars().all()
    eval_map = {e.participant_id: e for e in evals}
    all_finalist_ids = r2_qual_ids.union(set(eval_map.keys()))

    if not all_finalist_ids:
        return []

    # 3. Fetch participants
    parts_res = await db.execute(
        select(Participant).where(Participant.id.in_(all_finalist_ids)).order_by(Participant.roll_number.asc())
    )
    participants = parts_res.scalars().all()

    # 4. Fetch Round Results for R1 and R2
    all_rr_res = await db.execute(
        select(RoundResult).where(RoundResult.participant_id.in_(all_finalist_ids))
    )
    all_rr = all_rr_res.scalars().all()
    
    r1_scores = {}
    r2_scores = {}
    for rr in all_rr:
        if r1 and rr.round_id == r1.id:
            r1_scores[rr.participant_id] = rr.score
        elif r2 and rr.round_id == r2.id:
            r2_scores[rr.participant_id] = rr.score

    # 5. Assemble finalist list
    finalists = []
    for p in participants:
        ev = eval_map.get(p.id)
        m_score = r1_scores.get(p.id)
        c_score = r2_scores.get(p.id)
        prev_tot = (m_score or 0) + (c_score or 0)
        pres_tot = ev.total_score if ev else 0
        grand_tot = prev_tot + pres_tot

        ev_detail = None
        if ev:
            ev_detail = EvaluationDetail(
                id=ev.id,
                presentation_score=ev.presentation_score,
                technical_score=ev.technical_score,
                viva_score=ev.viva_score,
                total_score=ev.total_score,
                remarks=ev.remarks,
                evaluator_name=ev.evaluator_name,
                created_at=ev.created_at.isoformat() if ev.created_at else ""
            )

        finalists.append(FinalistOut(
            participant_id=p.id,
            roll_number=p.roll_number,
            name=p.name,
            email=p.email,
            academic_year=p.academic_year,
            mcq_score=m_score,
            coding_score=c_score,
            total_previous_score=prev_tot,
            grand_total_score=grand_tot,
            status="EVALUATED" if ev else "PENDING",
            evaluation=ev_detail
        ))

    # Sort: Evaluated with highest grand total first, then pending with highest previous score
    finalists.sort(key=lambda x: (x.status == "PENDING", -x.grand_total_score, -x.total_previous_score))
    return finalists


@router.api_route("/evaluate", methods=["POST", "PUT"])
@router.api_route("/evaluate/", methods=["POST", "PUT"])
async def evaluate_presentation(
    payload: EvaluationRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin)
):
    """
    Assigns Level 3 Presentation marks to a qualified finalist.
    Updates or creates PresentationEvaluation and syncs Round 3 RoundResult.
    """
    # 1. Verify participant exists
    p_res = await db.execute(select(Participant).where(Participant.id == payload.participant_id))
    participant = p_res.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")

    # 2. Get Round 3
    r3_res = await db.execute(select(Round).where(Round.round_number == 3))
    r3 = r3_res.scalar_one_or_none()
    if not r3:
        raise HTTPException(status_code=400, detail="Round 3 (Presentation) not initialized.")

    total_eval = payload.presentation_score + payload.technical_score + payload.viva_score

    # 3. Upsert PresentationEvaluation
    ev_res = await db.execute(
        select(PresentationEvaluation).where(PresentationEvaluation.participant_id == payload.participant_id)
    )
    evaluation = ev_res.scalar_one_or_none()

    evaluator_display = admin.username if admin else "Faculty Evaluator"
    if not evaluation:
        evaluation = PresentationEvaluation(
            participant_id=payload.participant_id,
            round_id=r3.id,
            evaluator_id=admin.id if admin else None,
            evaluator_name=evaluator_display,
            presentation_score=payload.presentation_score,
            technical_score=payload.technical_score,
            viva_score=payload.viva_score,
            total_score=total_eval,
            remarks=payload.remarks,
            created_at=datetime.now(timezone.utc)
        )
        db.add(evaluation)
    else:
        evaluation.presentation_score = payload.presentation_score
        evaluation.technical_score = payload.technical_score
        evaluation.viva_score = payload.viva_score
        evaluation.total_score = total_eval
        evaluation.remarks = payload.remarks
        evaluation.evaluator_id = admin.id if admin else evaluation.evaluator_id
        evaluation.evaluator_name = evaluator_display

    # 4. Sync Round 3 RoundResult
    rr_res = await db.execute(
        select(RoundResult).where(
            RoundResult.participant_id == payload.participant_id,
            RoundResult.round_id == r3.id
        )
    )
    rr = rr_res.scalar_one_or_none()
    if not rr:
        rr = RoundResult(
            participant_id=payload.participant_id,
            round_id=r3.id,
            score=total_eval,
            is_qualified=True,
            completed_at=datetime.now(timezone.utc)
        )
        db.add(rr)
    else:
        rr.score = total_eval
        rr.is_qualified = True
        rr.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(evaluation)

    # Invalidate leaderboard & stats caches
    memory_cache.delete("admin_leaderboard")
    memory_cache.delete("admin_live_stats")
    memory_cache.delete(f"part:{payload.participant_id}")

    return {
        "message": f"Successfully evaluated {participant.roll_number} ({participant.name}) with {total_eval}/30 marks.",
        "participant_id": participant.id,
        "total_score": total_eval,
        "evaluator": evaluator_display
    }


@router.api_route("/promote-l2-finalists", methods=["POST", "PUT"])
@router.api_route("/promote-l2-finalists/", methods=["POST", "PUT"])
async def promote_l2_finalists(
    payload: BulkPromoteRequest,
    db: AsyncSession = Depends(get_db),
    _: AdminUser = Depends(get_current_admin)
):
    """
    Qualifies selected Level 2 participants for Level 3.
    """
    r2 = (await db.execute(select(Round).where(Round.round_number == 2))).scalar_one_or_none()
    if not r2:
        raise HTTPException(status_code=400, detail="Round 2 not found.")

    promoted_count = 0
    if payload.participant_ids:
        for pid in payload.participant_ids:
            rr = (await db.execute(
                select(RoundResult).where(RoundResult.participant_id == pid, RoundResult.round_id == r2.id)
            )).scalar_one_or_none()
            if rr:
                rr.is_qualified = True
                promoted_count += 1
            else:
                db.add(RoundResult(
                    participant_id=pid,
                    round_id=r2.id,
                    score=0,
                    is_qualified=True
                ))
                promoted_count += 1
    elif payload.min_coding_score is not None:
        rrs = (await db.execute(
            select(RoundResult).where(RoundResult.round_id == r2.id, RoundResult.score >= payload.min_coding_score)
        )).scalars().all()
        for rr in rrs:
            if not rr.is_qualified:
                rr.is_qualified = True
                promoted_count += 1

    await db.commit()
    memory_cache.delete("admin_leaderboard")
    memory_cache.delete("admin_live_stats")

    return {"message": f"Successfully qualified {promoted_count} participants for Level 3."}
