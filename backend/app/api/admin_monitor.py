import csv
import io
import asyncio
from typing import List
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct
from app.db.session import get_db
from app.db.models import (
    Participant, MCQAttempt, CodingAttempt, SecurityEvent, RoundResult, Round, CodingSubmission
)
from app.schemas.admin import LiveStats, LeaderboardEntry
from app.api.deps import get_current_admin
from app.core.cache import memory_cache

router = APIRouter(prefix="/admin/monitor", tags=["Admin Live Monitor"])

@router.get("/live", response_model=LiveStats)
async def get_live_stats(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    cached = memory_cache.get("admin_live_stats")
    if cached is not None:
        return cached

    # Fast parallel execution of summary statistics
    tasks = [
        db.execute(select(func.count(Participant.id))),
        db.execute(select(func.count(Participant.id)).where(Participant.is_enabled == True)),
        db.execute(select(func.count(MCQAttempt.id)).where(MCQAttempt.status == "IN_PROGRESS")),
        db.execute(select(func.count(MCQAttempt.id)).where(MCQAttempt.status == "SUBMITTED")),
        db.execute(select(func.count(CodingAttempt.id)).where(CodingAttempt.status == "IN_PROGRESS")),
        db.execute(select(func.count(CodingAttempt.id)).where(CodingAttempt.status == "SUBMITTED")),
        db.execute(select(func.count(distinct(MCQAttempt.participant_id))).where(MCQAttempt.status == "TERMINATED")),
        db.execute(select(func.count(SecurityEvent.id))),
        db.execute(select(func.count(RoundResult.id)).where(RoundResult.is_qualified == True)),
        db.execute(select(func.count(RoundResult.id)).where(RoundResult.is_qualified == False))
    ]
    results = await asyncio.gather(*tasks)

    stats = LiveStats(
        total_participants=results[0].scalar() or 0,
        enabled_participants=results[1].scalar() or 0,
        active_mcq_attempts=results[2].scalar() or 0,
        submitted_mcq_attempts=results[3].scalar() or 0,
        active_coding_attempts=results[4].scalar() or 0,
        submitted_coding_attempts=results[5].scalar() or 0,
        terminated_count=results[6].scalar() or 0,
        total_violations=results[7].scalar() or 0,
        qualified_count=results[8].scalar() or 0,
        not_qualified_count=results[9].scalar() or 0
    )
    memory_cache.set("admin_live_stats", stats, ttl_seconds=3.0)
    return stats

@router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    cached = memory_cache.get("admin_leaderboard")
    if cached is not None:
        return cached

    # Fetch participants and results
    parts = (await db.execute(select(Participant).order_by(Participant.roll_number.asc()))).scalars().all()
    results = (await db.execute(select(RoundResult))).scalars().all()
    violations = (await db.execute(
        select(SecurityEvent.participant_id, func.count(SecurityEvent.id))
        .group_by(SecurityEvent.participant_id)
    )).all()
    viol_map = {row[0]: row[1] for row in violations}

    # Fetch realtime live coding submissions aggregated by problem
    live_sub_rows = (await db.execute(
        select(
            CodingAttempt.participant_id,
            CodingSubmission.problem_id,
            func.max(CodingSubmission.score)
        )
        .join(CodingAttempt, CodingSubmission.attempt_id == CodingAttempt.id)
        .group_by(CodingAttempt.participant_id, CodingSubmission.problem_id)
    )).all()
    live_coding_scores = {}
    for p_id, _, score_val in live_sub_rows:
        live_coding_scores[p_id] = live_coding_scores.get(p_id, 0) + (score_val or 0)

    coding_att_parts = {
        row[0] for row in (await db.execute(select(distinct(CodingAttempt.participant_id)))).all()
    }

    # Map results by (participant_id, round_number)
    rounds = (await db.execute(select(Round))).scalars().all()
    round_map = {r.id: r.round_number for r in rounds}
    
    score_map = {}
    for r in results:
        r_num = round_map.get(r.round_id, 1)
        score_map[(r.participant_id, r_num)] = (r.score, r.is_qualified)

    leaderboard = []
    for p in parts:
        mcq_data = score_map.get((p.id, 1))
        coding_data = score_map.get((p.id, 2))
        pres_data = score_map.get((p.id, 3))
        
        mcq_s = mcq_data[0] if mcq_data else None
        mcq_q = mcq_data[1] if mcq_data else None

        rr_code_score = coding_data[0] if coding_data is not None else None
        live_code_score = live_coding_scores.get(p.id)
        
        if rr_code_score is not None or live_code_score is not None:
            code_s = max(rr_code_score or 0, live_code_score or 0)
        elif p.id in coding_att_parts:
            code_s = 0
        else:
            code_s = None
        
        pres_s = pres_data[0] if pres_data else None
        
        total = (mcq_s or 0) + (code_s or 0) + (pres_s or 0)
        viols = viol_map.get(p.id, 0)

        leaderboard.append({
            "participant_id": p.id,
            "roll_number": p.roll_number,
            "name": p.name,
            "academic_year": p.academic_year,
            "mcq_score": mcq_s,
            "mcq_qualified": mcq_q,
            "coding_score": code_s,
            "presentation_score": pres_s,
            "total_score": total,
            "violations": viols
        })

    # Sort by total_score desc, violations asc
    leaderboard.sort(key=lambda x: (-x["total_score"], x["violations"], x["roll_number"]))
    for rank, entry in enumerate(leaderboard, 1):
        entry["rank"] = rank

    output = [LeaderboardEntry(**entry) for entry in leaderboard]
    memory_cache.set("admin_leaderboard", output, ttl_seconds=3.0)
    return output

@router.get("/export/csv")
async def export_results_csv(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    entries = await get_leaderboard(db=db, _=None)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Rank", "Roll Number", "Name", "Year", "MCQ Score (/25)", "Qualified L2", "Coding Score (/60)", "Presentation Score (/50)", "Total Score", "Violations"])
    for e in entries:
        writer.writerow([
            e.rank,
            e.roll_number,
            e.name,
            e.academic_year,
            e.mcq_score if e.mcq_score is not None else "N/A",
            "Yes" if e.mcq_qualified else "No",
            e.coding_score if e.coding_score is not None else "N/A",
            e.presentation_score if e.presentation_score is not None else "N/A",
            e.total_score,
            e.violations
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=competition_results.csv"}
    )
