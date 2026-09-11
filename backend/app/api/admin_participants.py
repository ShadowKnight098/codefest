import csv
import io
import random
import string
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from app.db.session import get_db
from app.db.models import (
    Participant, MCQAttempt, CodingAttempt, RoundResult, SecurityEvent, Round,
    MCQAttemptQuestion, MCQAnswer, CodingSubmission, L2QuestionAssignment, L2Answer,
    ParticipantFeedback
)
from app.core.security import hash_pin
from app.schemas.admin import (
    ParticipantCreate, ParticipantUpdate, ParticipantAdminResponse,
    ImportResult, ImportValidationRow, PinResetResponse, BulkTextImportRequest
)
from app.api.deps import get_current_admin, require_superadmin
from app.core.cache import memory_cache

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

def parse_academic_year(val: any) -> int:
    if val is None:
        return 2
    s = str(val).strip().upper()
    if not s:
        return 2
    # 1. Exact or substring keyword checks
    if "SECOND" in s or "2ND" in s or "SOPHOMORE" in s:
        return 2
    if "THIRD" in s or "3RD" in s or "JUNIOR" in s:
        return 3
    if "FIRST" in s or "1ST" in s or "FRESHMAN" in s:
        return 1
    if "FOURTH" in s or "4TH" in s or "FINAL" in s or "SENIOR" in s:
        return 4
    # 2. Strict Roman numerals
    if re.search(r'\bIV\b', s):
        return 4
    if re.search(r'\bIII\b', s):
        return 3
    if re.search(r'\bII\b', s):
        return 2
    if re.search(r'\bI\b', s):
        return 1
    # 3. Numeric patterns with word boundary
    m = re.search(r'\b([1-4])\b', s)
    if m:
        return int(m.group(1))
    m2 = re.search(r'([1-4])(?:ST|ND|RD|TH)?\s*(?:YEAR|YR)?', s)
    if m2:
        return int(m2.group(1))
    for ch in s:
        if ch in "1234":
            return int(ch)
    return 2

def normalize_header_key(k: any) -> str:
    return re.sub(r'[^a-z0-9]', '', str(k).lower())

def sanitize_email(email: str, roll: str) -> str:
    email = (email or "").strip().lower()
    clean_roll = re.sub(r'[^a-z0-9]', '', roll.lower()) or "student"
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        return f"{clean_roll}@codefest.local"
    return email

@router.post("/import", response_model=ImportResult)
async def import_participants_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    """
    Bulk import participants from CSV.
    Supports flexible header names (RollNumber, Register Number, Name, Email, Year, etc.) and formats.
    Automatically upserts existing participants safely.
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

    # Get max existing FDH counter
    existing_fdhs = (await db.execute(select(Participant).where(Participant.roll_number.like('FDH%')))).scalars().all()
    fdh_counter = 0
    for p in existing_fdhs:
        m = re.search(r'FDH(\d+)', p.roll_number, re.IGNORECASE)
        if m:
            fdh_counter = max(fdh_counter, int(m.group(1)))

    batch_rolls = {}
    batch_emails = {}

    row_num = 1
    for row in reader:
        row_num += 1
        try:
            row_norm = {normalize_header_key(k): (v or "").strip() for k, v in row.items() if k}

            # Extract roll number / register number
            roll = None
            for k in ("registernumber", "registerno", "register", "registrationnumber", "registrationno", "regno", "rollnumber", "rollno", "roll", "htno", "hallticket", "hallticketno", "id"):
                if k in row_norm and row_norm[k]:
                    roll = row_norm[k].strip().upper()
                    break
            if not roll:
                for k, v in row_norm.items():
                    if any(term in k for term in ("register", "regno", "roll", "ticket", "htno")):
                        roll = v.strip().upper()
                        break

            # Extract name
            name = None
            for k in ("name", "studentname", "fullname", "candidatename"):
                if k in row_norm and row_norm[k]:
                    name = row_norm[k].strip()
                    break
            if not name:
                for k, v in row_norm.items():
                    if "name" in k:
                        name = v.strip()
                        break

            # Extract email
            email = None
            for k in ("email", "emailid", "mail", "mailid", "emailaddress"):
                if k in row_norm and row_norm[k]:
                    email = row_norm[k].strip().lower()
                    break
            if not email:
                for k, v in row_norm.items():
                    if "email" in k or "mail" in k:
                        email = v.strip().lower()
                        break

            # Extract year
            year_raw = None
            for k in ("year", "academicyear", "yr", "class", "batch"):
                if k in row_norm and row_norm[k]:
                    year_raw = row_norm[k].strip()
                    break
            if not year_raw:
                for k, v in row_norm.items():
                    if "year" in k:
                        year_raw = v.strip()
                        break

            # If headers completely failed to match, fallback to positional if non-timestamp
            if not roll and len(row) >= 1:
                values = [v for v in row.values() if v is not None]
                non_ts_vals = [str(v).strip() for v in values if not re.search(r'\d{1,2}/\d{1,2}/\d{4}', str(v))]
                if non_ts_vals:
                    roll = non_ts_vals[0].upper()
                    if len(non_ts_vals) >= 2 and not name:
                        name = non_ts_vals[1]
                    if len(non_ts_vals) >= 3 and not email:
                        email = non_ts_vals[2].lower()
                    if len(non_ts_vals) >= 4 and not year_raw:
                        year_raw = non_ts_vals[3]

            if not roll:
                skipped += 1
                errors.append(ImportValidationRow(
                    row_number=row_num,
                    roll_number="",
                    email=email or "",
                    name=name or "",
                    academic_year=0,
                    status="error",
                    error="Row missing roll number"
                ))
                continue

            # Handle FDH rolls
            if "fdh" in roll.lower():
                clean_email = (email or "").strip().lower()
                if clean_email and clean_email in batch_emails:
                    roll = batch_emails[clean_email].roll_number
                else:
                    ex_p = None
                    if clean_email:
                        ex_p = (await db.execute(select(Participant).where(Participant.email == clean_email))).scalar_one_or_none()
                    if ex_p and ex_p.roll_number.startswith("FDH"):
                        roll = ex_p.roll_number
                    else:
                        fdh_counter += 1
                        roll = f"FDH{fdh_counter}"
            else:
                roll = re.sub(r'\s+', '', roll).upper()

            if not name:
                name = roll
            else:
                name = re.sub(r'\s+', ' ', name).strip()

            year = parse_academic_year(year_raw)
            email = sanitize_email(email, roll)

            # In-batch duplicate check
            if roll in batch_rolls or email in batch_emails:
                existing_batch_p = batch_rolls.get(roll) or batch_emails.get(email)
                existing_batch_p.name = name
                existing_batch_p.email = email
                existing_batch_p.academic_year = year
                existing_batch_p.is_enabled = True
                imported += 1
                continue

            # DB duplicate check
            existing_p = (await db.execute(
                select(Participant).where(
                    (Participant.roll_number == roll) | (Participant.email == email)
                )
            )).scalar_one_or_none()

            # Optional custom PIN or default to roll number
            custom_pin = row.get("pin") or row_norm.get("pin")

            if existing_p:
                existing_p.roll_number = roll
                existing_p.name = name
                existing_p.email = email
                existing_p.academic_year = year
                existing_p.is_enabled = True
                if custom_pin and custom_pin.strip():
                    existing_p.hashed_pin = hash_pin(custom_pin.strip().upper())
                batch_rolls[roll] = existing_p
                batch_emails[email] = existing_p
                imported += 1
            else:
                pin = (custom_pin or roll).strip().upper()
                new_participant = Participant(
                    roll_number=roll,
                    email=email,
                    name=name,
                    academic_year=year,
                    hashed_pin=hash_pin(pin),
                    is_enabled=True
                )
                db.add(new_participant)
                batch_rolls[roll] = new_participant
                batch_emails[email] = new_participant
                imported += 1

        except Exception as row_err:
            skipped += 1
            errors.append(ImportValidationRow(
                row_number=row_num,
                roll_number=roll or "",
                email=email or "",
                name=name or "",
                academic_year=0,
                status="error",
                error=f"Row processing error: {str(row_err)}"
            ))

    try:
        await db.commit()
    except Exception as commit_err:
        await db.rollback()
        errors.append(ImportValidationRow(
            row_number=0,
            roll_number="",
            email="",
            name="",
            academic_year=0,
            status="error",
            error=f"Database commit error: {str(commit_err)}"
        ))
        return ImportResult(
            total_rows=row_num - 1,
            imported=0,
            skipped=row_num - 1,
            errors=errors
        )

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
    Bulk import participants by directly pasting text/CSV/TSV lines.
    Handles headers, quotes, custom formats (e.g. '3 YEAR'), and auto-upserts existing students safely.
    """
    raw = payload.raw_text.strip()
    if not raw:
        return ImportResult(total_rows=0, imported=0, skipped=0, errors=[])

    delimiter = "\t" if "\t" in raw else ","
    reader = csv.reader(io.StringIO(raw), delimiter=delimiter)

    imported = 0
    skipped = 0
    errors: List[ImportValidationRow] = []

    # Get max existing FDH counter
    existing_fdhs = (await db.execute(select(Participant).where(Participant.roll_number.like('FDH%')))).scalars().all()
    fdh_counter = 0
    for p in existing_fdhs:
        m = re.search(r'FDH(\d+)', p.roll_number, re.IGNORECASE)
        if m:
            fdh_counter = max(fdh_counter, int(m.group(1)))

    batch_rolls = {}
    batch_emails = {}

    header_mapped = False
    col_map = {"roll": 0, "name": 1, "email": 2, "year": 3}

    row_num = 0
    for parts in reader:
        if not parts or not any(p.strip() for p in parts):
            continue

        parts = [p.strip() for p in parts]
        row_num += 1

        try:
            # Check if row 1 is a header line
            first_row_check = [normalize_header_key(p) for p in parts]
            if not header_mapped and any(
                any(term in k for term in ("register", "regno", "roll", "ticket", "email", "mail", "name"))
                for k in first_row_check
            ):
                header_mapped = True
                for idx, k in enumerate(first_row_check):
                    if any(term in k for term in ("register", "regno", "roll", "ticket", "htno")):
                        col_map["roll"] = idx
                    elif "name" in k:
                        col_map["name"] = idx
                    elif "email" in k or "mail" in k:
                        col_map["email"] = idx
                    elif "year" in k or "class" in k:
                        col_map["year"] = idx
                continue

            # Extract by mapped column or position
            roll = parts[col_map["roll"]].strip().upper() if len(parts) > col_map["roll"] else ""
            name = parts[col_map["name"]].strip() if len(parts) > col_map["name"] else ""
            email = parts[col_map["email"]].strip().lower() if len(parts) > col_map["email"] else ""
            year_raw = parts[col_map["year"]].strip() if len(parts) > col_map["year"] else ""

            # Skip comment or duplicate header lines
            if roll.startswith("#") or roll in ("ROLL", "ROLLNUMBER", "ROLL_NUMBER", "ROLL NUMBER", "ROLLNO", "REGISTER", "REGISTERNUMBER", "REGNO"):
                continue

            # If email and name got swapped (e.g. column 1 was email and 2 was name)
            if "@" in name and "@" not in email:
                name, email = email, name

            if not roll:
                skipped += 1
                errors.append(ImportValidationRow(
                    row_number=row_num,
                    roll_number="",
                    email=email,
                    name=name,
                    academic_year=0,
                    status="error",
                    error="Line missing roll number"
                ))
                continue

            # Handle FDH rolls
            if "fdh" in roll.lower():
                clean_email = (email or "").strip().lower()
                if clean_email and clean_email in batch_emails:
                    roll = batch_emails[clean_email].roll_number
                else:
                    ex_p = None
                    if clean_email:
                        ex_p = (await db.execute(select(Participant).where(Participant.email == clean_email))).scalar_one_or_none()
                    if ex_p and ex_p.roll_number.startswith("FDH"):
                        roll = ex_p.roll_number
                    else:
                        fdh_counter += 1
                        roll = f"FDH{fdh_counter}"
            else:
                roll = re.sub(r'\s+', '', roll).upper()

            if not name:
                name = roll
            else:
                name = re.sub(r'\s+', ' ', name).strip()

            year = parse_academic_year(year_raw)
            email = sanitize_email(email, roll)

            # In-batch duplicate check
            if roll in batch_rolls or email in batch_emails:
                existing_batch_p = batch_rolls.get(roll) or batch_emails.get(email)
                existing_batch_p.name = name
                existing_batch_p.email = email
                existing_batch_p.academic_year = year
                existing_batch_p.is_enabled = True
                imported += 1
                continue

            # DB duplicate check
            existing_p = (await db.execute(
                select(Participant).where(
                    (Participant.roll_number == roll) | (Participant.email == email)
                )
            )).scalar_one_or_none()

            if existing_p:
                existing_p.roll_number = roll
                existing_p.name = name
                existing_p.email = email
                existing_p.academic_year = year
                existing_p.is_enabled = True
                batch_rolls[roll] = existing_p
                batch_emails[email] = existing_p
                imported += 1
            else:
                pin = roll
                new_participant = Participant(
                    roll_number=roll,
                    email=email,
                    name=name,
                    academic_year=year,
                    hashed_pin=hash_pin(pin),
                    is_enabled=True
                )
                db.add(new_participant)
                batch_rolls[roll] = new_participant
                batch_emails[email] = new_participant
                imported += 1

        except Exception as row_err:
            skipped += 1
            errors.append(ImportValidationRow(
                row_number=row_num,
                roll_number=roll or "",
                email=email or "",
                name=name or "",
                academic_year=0,
                status="error",
                error=f"Line processing error: {str(row_err)}"
            ))

    try:
        await db.commit()
    except Exception as commit_err:
        await db.rollback()
        errors.append(ImportValidationRow(
            row_number=0,
            roll_number="",
            email="",
            name="",
            academic_year=0,
            status="error",
            error=f"Database commit error: {str(commit_err)}"
        ))
        return ImportResult(
            total_rows=row_num,
            imported=0,
            skipped=row_num,
            errors=errors
        )

    return ImportResult(
        total_rows=row_num,
        imported=imported,
        skipped=skipped,
        errors=errors
    )

# ─── Technical Emergency Reset & Reassignment Endpoints ───

@router.post("/{participant_id}/reset-level1")
async def reset_participant_level1(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Emergency Technical Reset for Level 1 (MCQ Assessment).
    Clears the participant's MCQ attempt, answers, violations, and Round 1 results,
    allowing them to start or resume Level 1 completely fresh.
    """
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")

    # 1. Delete MCQ Security Events
    await db.execute(
        delete(SecurityEvent).where(
            (SecurityEvent.participant_id == participant_id) &
            (SecurityEvent.attempt_type == "MCQ")
        )
    )

    # 2. Explicitly delete child answers and attempt_questions to prevent foreign key errors
    att_res = await db.execute(select(MCQAttempt.id).where(MCQAttempt.participant_id == participant_id))
    att_ids = att_res.scalars().all()
    if att_ids:
        await db.execute(delete(MCQAnswer).where(MCQAnswer.attempt_id.in_(att_ids)))
        await db.execute(delete(MCQAttemptQuestion).where(MCQAttemptQuestion.attempt_id.in_(att_ids)))

    # 3. Delete Round 1 Result
    round_1 = (await db.execute(select(Round).where(Round.round_number == 1))).scalar_one_or_none()
    if round_1:
        await db.execute(
            delete(RoundResult).where(
                (RoundResult.participant_id == participant_id) &
                (RoundResult.round_id == round_1.id)
            )
        )

    # 4. Delete MCQ Attempt
    await db.execute(
        delete(MCQAttempt).where(MCQAttempt.participant_id == participant_id)
    )

    await db.commit()
    memory_cache.delete("admin_leaderboard")
    memory_cache.delete("admin_live_stats")
    memory_cache.delete(f"part:{participant_id}")
    return {"message": f"Level 1 (MCQ Assessment) for {participant.roll_number} has been completely reset. The student can now start Level 1 fresh."}


@router.post("/{participant_id}/reset-level2")
async def reset_participant_level2(
    participant_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Emergency Technical Reset for Level 2 (Coding Assessment).
    Clears the participant's Coding attempt, submissions, violations, and Round 2 results,
    allowing them to start or resume Level 2 completely fresh.
    """
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")

    # 1. Delete Coding Security Events
    await db.execute(
        delete(SecurityEvent).where(
            (SecurityEvent.participant_id == participant_id) &
            (SecurityEvent.attempt_type == "CODING")
        )
    )

    # 2. Explicitly delete child submissions to prevent foreign key errors
    c_att_res = await db.execute(select(CodingAttempt.id).where(CodingAttempt.participant_id == participant_id))
    c_att_ids = c_att_res.scalars().all()
    if c_att_ids:
        await db.execute(delete(CodingSubmission).where(CodingSubmission.attempt_id.in_(c_att_ids)))

    # 3. Delete Round 2 Result
    round_2 = (await db.execute(select(Round).where(Round.round_number == 2))).scalar_one_or_none()
    if round_2:
        await db.execute(
            delete(RoundResult).where(
                (RoundResult.participant_id == participant_id) &
                (RoundResult.round_id == round_2.id)
            )
        )

    # 4. Delete Coding Attempt
    await db.execute(
        delete(CodingAttempt).where(CodingAttempt.participant_id == participant_id)
    )

    # 5. Delete Level 2 Debugging answers and question assignments
    await db.execute(
        delete(L2Answer).where(L2Answer.participant_id == participant_id)
    )
    await db.execute(
        delete(L2QuestionAssignment).where(L2QuestionAssignment.participant_id == participant_id)
    )

    await db.commit()
    memory_cache.delete("admin_leaderboard")
    memory_cache.delete("admin_live_stats")
    memory_cache.delete(f"part:{participant_id}")
    return {"message": f"Level 2 (Coding Assessment) for {participant.roll_number} has been completely reset. The student can now start Level 2 fresh."}


@router.post("/{participant_id}/override-level2-qualification")
async def override_level2_qualification(
    participant_id: str,
    request: Request,
    is_qualified: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Emergency Technical Override: Qualify or Disqualify participant for Level 2.
    Supports 1-click toggle, explicit boolean payload, or URL parameter.
    """
    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found.")

    round_1 = (await db.execute(select(Round).where(Round.round_number == 1))).scalar_one_or_none()
    if not round_1:
        raise HTTPException(status_code=400, detail="Round 1 not found.")

    r1_res = await db.execute(
        select(RoundResult).where(
            (RoundResult.participant_id == participant_id) &
            (RoundResult.round_id == round_1.id)
        )
    )
    r1_result = r1_res.scalar_one_or_none()

    # Parse JSON body safely
    payload = None
    try:
        payload = await request.json()
    except Exception:
        pass

    # Determine desired status: explicit param > explicit payload body > toggle
    target_status = is_qualified
    if target_status is None and payload and "is_qualified" in payload:
        target_status = bool(payload["is_qualified"])

    if r1_result:
        if target_status is not None:
            r1_result.is_qualified = target_status
        else:
            r1_result.is_qualified = not r1_result.is_qualified
        new_status = r1_result.is_qualified
    else:
        new_status = True if target_status is None else target_status
        db.add(RoundResult(
            participant_id=participant_id,
            round_id=round_1.id,
            score=18 if new_status else 0,
            is_qualified=new_status
        ))

    await db.commit()
    memory_cache.delete("admin_leaderboard")
    memory_cache.delete("admin_live_stats")
    memory_cache.delete(f"part:{participant_id}")
    status_label = "QUALIFIED" if new_status else "DISQUALIFIED"
    return {
        "message": f"{participant.roll_number} ({participant.name}) is now {status_label} for Level 2.",
        "is_qualified": new_status,
        "participant_id": participant_id
    }


@router.get("/feedback/list")
async def list_student_feedbacks(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Fetch all student feedbacks submitted for CodeFest 2026.
    """
    res = await db.execute(
        select(ParticipantFeedback, Participant)
        .join(Participant, ParticipantFeedback.participant_id == Participant.id)
        .order_by(ParticipantFeedback.created_at.desc())
    )
    rows = res.all()
    out = []
    for fb, p in rows:
        out.append({
            "id": fb.id,
            "participant_id": p.id,
            "roll_number": p.roll_number,
            "name": p.name,
            "email": p.email,
            "academic_year": p.academic_year,
            "rating": fb.rating,
            "feedback_text": fb.feedback_text,
            "created_at": fb.created_at.isoformat() if fb.created_at else ""
        })
    return out



