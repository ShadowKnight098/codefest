from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.db.models import Participant, SecurityEvent, MCQAttempt, CodingAttempt, CompetitionSetting
from app.api.deps import get_current_participant

router = APIRouter(prefix="/security", tags=["Security & Proctoring"])

class ViolationReportRequest(BaseModel):
    attempt_type: str # "MCQ" or "CODING"
    attempt_id: str
    idempotency_key: str
    event_type: str = "TAB_HIDDEN"

class ViolationResponse(BaseModel):
    status: str # "WARNING", "FINAL_WARNING", "TERMINATED"
    violation_count: int
    max_violations: int
    terminated: bool
    message: str

@router.post("/violation", response_model=ViolationResponse)
async def report_violation(
    payload: ViolationReportRequest,
    current_participant: Participant = Depends(get_current_participant),
    db: AsyncSession = Depends(get_db)
):
    # Idempotent check
    existing = await db.execute(
        select(SecurityEvent).where(
            SecurityEvent.attempt_id == payload.attempt_id,
            SecurityEvent.idempotency_key == payload.idempotency_key
        )
    )
    if existing.scalar_one_or_none():
        # Already logged this idempotent event
        count = (await db.execute(
            select(func.count(SecurityEvent.id)).where(
                SecurityEvent.attempt_id == payload.attempt_id
            )
        )).scalar() or 1
        return ViolationResponse(
            status="WARNING",
            violation_count=count,
            max_violations=5,
            terminated=False,
            message="Violation already recorded."
        )

    # Count current violations
    current_count = (await db.execute(
        select(func.count(SecurityEvent.id)).where(
            SecurityEvent.attempt_id == payload.attempt_id
        )
    )).scalar() or 0

    new_count = current_count + 1

    # Fetch max violations threshold from settings
    max_setting = await db.execute(
        select(CompetitionSetting.value).where(CompetitionSetting.key == "max_security_violations")
    )
    max_val = max_setting.scalar_one_or_none()
    max_violations = int(max_val) if max_val else 5

    # Record event
    event = SecurityEvent(
        participant_id=current_participant.id,
        attempt_type=payload.attempt_type.upper(),
        attempt_id=payload.attempt_id,
        event_type=payload.event_type,
        violation_count=new_count,
        idempotency_key=payload.idempotency_key
    )
    db.add(event)

    # Check if threshold reached
    terminated = False
    if new_count >= max_violations:
        terminated = True
        # Terminate attempt
        if payload.attempt_type.upper() == "MCQ":
            att_res = await db.execute(select(MCQAttempt).where(MCQAttempt.id == payload.attempt_id))
            att = att_res.scalar_one_or_none()
            if att:
                att.status = "TERMINATED"
        else:
            att_res = await db.execute(select(CodingAttempt).where(CodingAttempt.id == payload.attempt_id))
            att = att_res.scalar_one_or_none()
            if att:
                att.status = "TERMINATED"

    await db.commit()

    if terminated:
        return ViolationResponse(
            status="TERMINATED",
            violation_count=new_count,
            max_violations=max_violations,
            terminated=True,
            message="Maximum tab-switch violations reached. Your assessment session has been terminated."
        )
    elif new_count == max_violations - 1:
        return ViolationResponse(
            status="FINAL_WARNING",
            violation_count=new_count,
            max_violations=max_violations,
            terminated=False,
            message="FINAL WARNING: Next tab switch or window blur will permanently terminate your assessment."
        )
    else:
        return ViolationResponse(
            status="WARNING",
            violation_count=new_count,
            max_violations=max_violations,
            terminated=False,
            message=f"Tab switch detected! Warning {new_count} of {max_violations}."
        )
