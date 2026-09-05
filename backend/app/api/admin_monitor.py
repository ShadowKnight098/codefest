import csv
import io
from typing import List
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct
from app.db.session import get_db
from app.db.models import (
    Participant, MCQAttempt, CodingAttempt, SecurityEvent, RoundResult, Round
)
from app.schemas.admin import LiveStats, LeaderboardEntry
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin/monitor", tags=["Admin Live Monitor"])

@router.get("/live", response_model=LiveStats)
async def get_live_stats(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    total_parts = (await db.execute(select(func.count(Participant.id)))).scalar() or 0
    enabled_parts = (await db.execute(select(func.count(Participant.id)).where(Participant.is_enabled == True))).scalar() or 0

    active_mcq = (await db.execute(select(func.count(MCQAttempt.id)).where(MCQAttempt.status == "IN_PROGRESS"))).scalar() or 0
    submitted_mcq = (await db.execute(select(func.count(MCQAttempt.id)).where(MCQAttempt.status == "SUBMITTED"))).scalar() or 0

    active_coding = (await db.execute(select(func.count(CodingAttempt.id)).where(CodingAttempt.status == "IN_PROGRESS"))).scalar() or 0
    submitted_coding = (await db.execute(select(func.count(CodingAttempt.id)).where(CodingAttempt.status == "SUBMITTED"))).scalar() or 0

    terminated_mcq = (await db.execute(select(func.count(distinct(MCQAttempt.participant_id))).where(MCQAttempt.status == "TERMINATED"))).scalar() or 0
    total_violations = (await db.execute(select(func.count(SecurityEvent.id)))).scalar() or 0

    qualified = (await db.execute(select(func.count(RoundResult.id)).where(RoundResult.is_qualified == True))).scalar() or 0
    not_qualified = (await db.execute(select(func.count(RoundResult.id)).where(RoundResult.is_qualified == False))).scalar() or 0

    return LiveStats(
        total_participants=total_parts,
        enabled_participants=enabled_parts,
        active_mcq_attempts=active_mcq,
        submitted_mcq_attempts=submitted_mcq,
        active_coding_attempts=active_coding,
        submitted_coding_attempts=submitted_coding,
        terminated_count=terminated_mcq,
        total_violations=total_violations,
        qualified_count=qualified,
        not_qualified_count=not_qualified
    )

@router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    # Fetch participants and results
    parts = (await db.execute(select(Participant).order_by(Participant.roll_number.asc()))).scalars().all()
    results = (await db.execute(select(RoundResult))).scalars().all()
    violations = (await db.execute(
        select(SecurityEvent.participant_id, func.count(SecurityEvent.id))
        .group_by(SecurityEvent.participant_id)
    )).all()
    viol_map = {row[0]: row[1] for row in violations}

    # Map results by (participant_id, round_number)
    # Get round 1 and round 2 IDs
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
        
        mcq_s = mcq_data[0] if mcq_data else None
        mcq_q = mcq_data[1] if mcq_data else None
        code_s = coding_data[0] if coding_data else None
        
        total = (mcq_s or 0) + (code_s or 0)
        viols = viol_map.get(p.id, 0)

        leaderboard.append({
            "participant_id": p.id,
            "roll_number": p.roll_number,
            "name": p.name,
            "academic_year": p.academic_year,
            "mcq_score": mcq_s,
            "mcq_qualified": mcq_q,
            "coding_score": code_s,
            "total_score": total,
            "violations": viols
        })

    # Sort by total_score desc, violations asc
    leaderboard.sort(key=lambda x: (-x["total_score"], x["violations"], x["roll_number"]))
    for rank, entry in enumerate(leaderboard, 1):
        entry["rank"] = rank

    return [LeaderboardEntry(**entry) for entry in leaderboard]

@router.get("/export/csv")
async def export_results_csv(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    entries = await get_leaderboard(db=db, _=None)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Rank", "Roll Number", "Name", "Year", "MCQ Score", "Qualified", "Coding Score", "Total Score", "Violations"])
    for e in entries:
        writer.writerow([
            e.rank,
            e.roll_number,
            e.name,
            e.academic_year,
            e.mcq_score if e.mcq_score is not None else "N/A",
            "Yes" if e.mcq_qualified else "No",
            e.coding_score if e.coding_score is not None else "N/A",
            e.total_score,
            e.violations
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=competition_results.csv"}
    )
