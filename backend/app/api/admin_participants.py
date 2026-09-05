import csv
import io
import random
import string
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from app.db.session import get_db
from app.db.models import Participant
from app.core.security import hash_pin
from app.schemas.admin import (
    ParticipantCreate, ParticipantUpdate, ParticipantAdminResponse,
    ImportResult, ImportValidationRow, PinResetResponse
)
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin/participants", tags=["Admin Participants"])

def generate_pin(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))

@router.get("", response_model=List[ParticipantAdminResponse])
async def list_participants(
    year: Optional[int] = Query(None, ge=1, le=4),
    search: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    query = select(Participant)
    if year:
        query = query.where(Participant.academic_year == year)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.where(
            (Participant.roll_number.ilike(search_pattern)) |
            (Participant.name.ilike(search_pattern)) |
            (Participant.email.ilike(search_pattern))
        )
    query = query.order_by(Participant.roll_number.asc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=ParticipantAdminResponse)
async def create_participant(
    payload: ParticipantCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    roll = payload.roll_number.strip().upper()
    email = payload.email.strip().lower()
    
    # Check duplicate
    existing = await db.execute(
        select(Participant).where(
            (Participant.roll_number == roll) | (Participant.email == email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant with this Roll Number or Email already exists."
        )

    pin = payload.pin or generate_pin(6)
    participant = Participant(
        roll_number=roll,
        email=email,
        name=payload.name.strip(),
        academic_year=payload.academic_year,
        hashed_pin=hash_pin(pin),
        is_enabled=True
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)
    return participant

@router.put("/{participant_id}", response_model=ParticipantAdminResponse)
async def update_participant(
    participant_id: str,
    payload: ParticipantUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")

    if payload.name is not None:
        participant.name = payload.name.strip()
    if payload.email is not None:
        participant.email = payload.email.strip().lower()
    if payload.academic_year is not None:
        participant.academic_year = payload.academic_year
    if payload.is_enabled is not None:
        participant.is_enabled = payload.is_enabled

    await db.commit()
    await db.refresh(participant)
    return participant

@router.delete("/{participant_id}")
async def delete_participant(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")
    await db.delete(participant)
    await db.commit()
    return {"message": f"Participant {participant.roll_number} deleted successfully."}

@router.post("/{participant_id}/reset-pin", response_model=PinResetResponse)
async def reset_participant_pin(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")

    new_pin = generate_pin(6)
    participant.hashed_pin = hash_pin(new_pin)
    await db.commit()
    return PinResetResponse(roll_number=participant.roll_number, new_pin=new_pin)

@router.post("/import", response_model=ImportResult)
async def import_participants_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Bulk import participants from CSV.
    Expected CSV columns: roll_number, email, name, academic_year, [pin]
    """
    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = content.decode("cp1252", errors="replace")

    reader = csv.DictReader(io.StringIO(decoded))
    imported = 0
    skipped = 0
    errors: List[ImportValidationRow] = []

    row_num = 1
    for row in reader:
        row_num += 1
        roll = (row.get("roll_number") or row.get("roll") or "").strip().upper()
        email = (row.get("email") or "").strip().lower()
        name = (row.get("name") or "").strip()
        year_raw = (row.get("academic_year") or row.get("year") or "").strip()
        pin = (row.get("pin") or "").strip() or generate_pin(6)

        if not roll or not email or not name or not year_raw:
            skipped += 1
            errors.append(ImportValidationRow(
                row_number=row_num,
                roll_number=roll,
                email=email,
                name=name,
                academic_year=0,
                status="error",
                error="Missing required fields: roll_number, email, name, or academic_year"
            ))
            continue

        try:
            year = int(year_raw)
            if year < 1 or year > 4:
                raise ValueError()
        except ValueError:
            skipped += 1
            errors.append(ImportValidationRow(
                row_number=row_num,
                roll_number=roll,
                email=email,
                name=name,
                academic_year=0,
                status="error",
                error=f"Invalid academic_year: {year_raw} (must be 1-4)"
            ))
            continue

        # Check existing
        existing = await db.execute(
            select(Participant.id).where(
                (Participant.roll_number == roll) | (Participant.email == email)
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            errors.append(ImportValidationRow(
                row_number=row_num,
                roll_number=roll,
                email=email,
                name=name,
                academic_year=year,
                status="error",
                error="Roll number or Email already exists in database."
            ))
            continue

        new_participant = Participant(
            roll_number=roll,
            email=email,
            name=name,
            academic_year=year,
            hashed_pin=hash_pin(pin),
            is_enabled=True
        )
        db.add(new_participant)
        imported += 1

    await db.commit()
    return ImportResult(
        total_rows=row_num - 1,
        imported=imported,
        skipped=skipped,
        errors=errors
    )
