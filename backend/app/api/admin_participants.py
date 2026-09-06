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
    ImportResult, ImportValidationRow, PinResetResponse, BulkTextImportRequest
)
from app.api.deps import get_current_admin, require_superadmin

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
    _: dict = Depends(require_superadmin)
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

    pin = (payload.pin or roll).strip().upper()
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
    _: dict = Depends(require_superadmin)
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
        pin = (row.get("pin") or roll).strip().upper()

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


@router.post("/import-text", response_model=ImportResult)
async def import_participants_text(
    payload: BulkTextImportRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """
    Bulk import participants by directly pasting text/CSV/TSV lines:
    Format: roll_number, name, email, academic_year
    """
    lines = [line.strip() for line in payload.raw_text.strip().splitlines() if line.strip()]
    imported = 0
    skipped = 0
    errors: List[ImportValidationRow] = []

    row_num = 0
    for line in lines:
        row_num += 1
        if line.startswith("#"):
            continue

        parts = [p.strip() for p in (line.split("\t") if "\t" in line else line.split(","))]
        if len(parts) < 4:
            skipped += 1
            errors.append(ImportValidationRow(
                row_number=row_num,
                roll_number=parts[0] if len(parts) > 0 else "",
                email=parts[2] if len(parts) > 2 else "",
                name=parts[1] if len(parts) > 1 else "",
                academic_year=0,
                status="error",
                error="Line must have at least 4 items: roll_number, name, email, academic_year"
            ))
            continue

        roll = parts[0].strip().upper()
        name = parts[1].strip()
        email = parts[2].strip().lower()
        year_raw = parts[3].strip()

        if roll in ("ROLL", "ROLL_NUMBER", "ROLL NUMBER", "ROLLNO"):
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
                error=f"Invalid academic_year: '{year_raw}' (must be 1, 2, 3, or 4)"
            ))
            continue

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

        pin = (parts[4] if len(parts) > 4 and parts[4].strip() else roll).strip().upper()
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
        total_rows=row_num,
        imported=imported,
        skipped=skipped,
        errors=errors
    )
