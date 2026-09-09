import csv
import io
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import MCQQuestion
from app.schemas.admin import (
    MCQQuestionCreate, MCQQuestionUpdate, MCQQuestionResponse
)
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin/mcq-questions", tags=["Admin MCQ Questions"])

def normalize_header_key(k: any) -> str:
    return re.sub(r'[^a-z0-9]', '', str(k).lower()) if k else ""

def parse_academic_year(val: any) -> int:
    if val is None:
        return 2
    s = str(val).strip().upper()
    if not s:
        return 2
    m = re.search(r'\b([1-4])\b', s)
    if m:
        return int(m.group(1))
    m2 = re.search(r'([1-4])(?:ST|ND|RD|TH)?\s*(?:YEAR|YR)?', s)
    if m2:
        return int(m2.group(1))
    if "IV" in s:
        return 4
    if "III" in s:
        return 3
    if "II" in s:
        return 2
    if "I" in s:
        return 1
    for ch in s:
        if ch in "1234":
            return int(ch)
    return 2

@router.get("", response_model=List[MCQQuestionResponse])
async def list_mcq_questions(
    year: Optional[int] = Query(None, ge=1, le=4),
    topic: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    query = select(MCQQuestion)
    if year:
        query = query.where(MCQQuestion.academic_year == year)
    if topic:
        query = query.where(MCQQuestion.topic.ilike(f"%{topic.strip()}%"))
    if difficulty:
        query = query.where(MCQQuestion.difficulty == difficulty.upper())
    query = query.order_by(MCQQuestion.academic_year.asc(), MCQQuestion.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=MCQQuestionResponse)
async def create_mcq_question(
    payload: MCQQuestionCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    q = MCQQuestion(
        academic_year=payload.academic_year,
        topic=payload.topic.strip(),
        difficulty=payload.difficulty,
        question_text=payload.question_text.strip(),
        option_a=payload.option_a.strip(),
        option_b=payload.option_b.strip(),
        option_c=payload.option_c.strip(),
        option_d=payload.option_d.strip(),
        correct_option=payload.correct_option.strip().upper(),
        is_active=True
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q

@router.put("/{question_id}", response_model=MCQQuestionResponse)
async def update_mcq_question(
    question_id: str,
    payload: MCQQuestionUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(MCQQuestion).where(MCQQuestion.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="MCQ Question not found.")

    if payload.topic is not None:
        q.topic = payload.topic.strip()
    if payload.difficulty is not None:
        q.difficulty = payload.difficulty
    if payload.question_text is not None:
        q.question_text = payload.question_text.strip()
    if payload.option_a is not None:
        q.option_a = payload.option_a.strip()
    if payload.option_b is not None:
        q.option_b = payload.option_b.strip()
    if payload.option_c is not None:
        q.option_c = payload.option_c.strip()
    if payload.option_d is not None:
        q.option_d = payload.option_d.strip()
    if payload.correct_option is not None:
        q.correct_option = payload.correct_option.strip().upper()
    if payload.is_active is not None:
        q.is_active = payload.is_active

    await db.commit()
    await db.refresh(q)
    return q

@router.delete("")
async def bulk_delete_mcq_questions(
    academic_year: Optional[int] = Query(None, ge=1, le=4),
    confirm: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Bulk delete MCQ questions (optionally filtered by academic year). Requires confirm=true."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to confirm bulk deletion.")

    stmt = delete(MCQQuestion)
    if academic_year:
        stmt = stmt.where(MCQQuestion.academic_year == academic_year)
    result = await db.execute(stmt)
    await db.commit()
    return {"message": f"Deleted {result.rowcount} MCQ questions."}

@router.delete("/{question_id}")
async def delete_mcq_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(MCQQuestion).where(MCQQuestion.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="MCQ Question not found.")
    await db.delete(q)
    await db.commit()
    return {"message": "Question deleted successfully."}

@router.post("/import")
async def import_mcq_questions_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Bulk import MCQ questions from CSV.
    Expected CSV columns: academic_year, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_option
    """
    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = content.decode("cp1252", errors="replace")

    reader = csv.DictReader(io.StringIO(decoded))
    imported = 0
    skipped = 0

    for row in reader:
        row_norm = {normalize_header_key(k): (v or "").strip() for k, v in row.items() if k}

        text = ""
        for k in ("questiontext", "question", "qtext", "problem"):
            if k in row_norm and row_norm[k]:
                text = row_norm[k]
                break
        if not text:
            for k, v in row_norm.items():
                if "question" in k:
                    text = v
                    break

        opt_a = row_norm.get("optiona") or row_norm.get("opta") or row_norm.get("a") or ""
        opt_b = row_norm.get("optionb") or row_norm.get("optb") or row_norm.get("b") or ""
        opt_c = row_norm.get("optionc") or row_norm.get("optc") or row_norm.get("c") or ""
        opt_d = row_norm.get("optiond") or row_norm.get("optd") or row_norm.get("d") or ""

        # Positional fallback if options weren't named
        if not (opt_a and opt_b and opt_c and opt_d) and len(row) >= 5:
            vals = list(row.values())
            if not text:
                text = vals[0]
            if len(vals) >= 5:
                opt_a = opt_a or vals[1]
                opt_b = opt_b or vals[2]
                opt_c = opt_c or vals[3]
                opt_d = opt_d or vals[4]

        correct_raw = (row_norm.get("correctoption") or row_norm.get("answer") or row_norm.get("correct") or "").upper().strip()
        correct = ""
        if "A" in correct_raw and not any(x in correct_raw for x in ["B", "C", "D"]):
            correct = "A"
        elif "B" in correct_raw and not any(x in correct_raw for x in ["A", "C", "D"]):
            correct = "B"
        elif "C" in correct_raw and not any(x in correct_raw for x in ["A", "B", "D"]):
            correct = "C"
        elif "D" in correct_raw and not any(x in correct_raw for x in ["A", "B", "C"]):
            correct = "D"
        elif correct_raw in ["1", "OPTION 1", "OPTION A"]:
            correct = "A"
        elif correct_raw in ["2", "OPTION 2", "OPTION B"]:
            correct = "B"
        elif correct_raw in ["3", "OPTION 3", "OPTION C"]:
            correct = "C"
        elif correct_raw in ["4", "OPTION 4", "OPTION D"]:
            correct = "D"
        elif correct_raw and correct_raw[0] in ["A", "B", "C", "D"]:
            correct = correct_raw[0]

        if not text or not opt_a or not opt_b or not opt_c or not opt_d or correct not in ["A", "B", "C", "D"]:
            skipped += 1
            continue

        topic = row_norm.get("topic") or row_norm.get("subject") or "General"
        diff = (row_norm.get("difficulty") or row_norm.get("level") or "MEDIUM").upper()
        if diff not in ["EASY", "MEDIUM", "HARD"]:
            diff = "MEDIUM"

        year_raw = row_norm.get("academicyear") or row_norm.get("year") or row_norm.get("class")
        year = parse_academic_year(year_raw)

        q = MCQQuestion(
            academic_year=year,
            topic=topic,
            difficulty=diff,
            question_text=text,
            option_a=opt_a,
            option_b=opt_b,
            option_c=opt_c,
            option_d=opt_d,
            correct_option=correct,
            is_active=True
        )
        db.add(q)
        imported += 1

    await db.commit()
    return {"message": f"Bulk import complete: {imported} imported, {skipped} skipped."}
