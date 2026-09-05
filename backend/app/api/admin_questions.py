import csv
import io
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
        year_raw = (row.get("academic_year") or row.get("year") or "").strip()
        topic = (row.get("topic") or "General").strip()
        diff = (row.get("difficulty") or "MEDIUM").strip().upper()
        text = (row.get("question_text") or row.get("question") or "").strip()
        opt_a = (row.get("option_a") or "").strip()
        opt_b = (row.get("option_b") or "").strip()
        opt_c = (row.get("option_c") or "").strip()
        opt_d = (row.get("option_d") or "").strip()
        correct = (row.get("correct_option") or row.get("answer") or "").strip().upper()

        if not text or not opt_a or not opt_b or not opt_c or not opt_d or correct not in ["A", "B", "C", "D"]:
            skipped += 1
            continue

        try:
            year = int(year_raw)
            if year < 1 or year > 4:
                year = 2
        except ValueError:
            year = 2

        if diff not in ["EASY", "MEDIUM", "HARD"]:
            diff = "MEDIUM"

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
