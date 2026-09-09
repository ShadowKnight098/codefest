import csv
import io
import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from app.db.session import get_db
from app.db.models import L2Question, CompetitionSetting
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin/coding-problems", tags=["Admin Level 2 Debugging Questions"])


# ─── Schemas ───

class L2QuestionAdminCreate(BaseModel):
    question_id: str = Field(..., min_length=1)
    academic_year: int = Field(..., ge=2, le=3, description="Must be 2 or 3 only")
    language: str = Field(default="python")
    difficulty: str = Field(default="medium")
    question: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)
    option_a: str = Field(..., min_length=1)
    option_b: str = Field(..., min_length=1)
    option_c: str = Field(..., min_length=1)
    option_d: str = Field(..., min_length=1)
    correct_answer: str = Field(..., pattern=r"^[a-dA-D]$")
    marks: int = Field(default=1, ge=1)
    is_active: bool = True

class L2QuestionAdminUpdate(BaseModel):
    question_id: Optional[str] = None
    academic_year: Optional[int] = Field(None, ge=2, le=3)
    language: Optional[str] = None
    difficulty: Optional[str] = None
    question: Optional[str] = None
    code: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_answer: Optional[str] = Field(None, pattern=r"^[a-dA-D]$")
    marks: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None

class L2QuestionAdminOut(BaseModel):
    id: str
    question_id: str
    academic_year: int
    language: str
    difficulty: str
    question: str
    code: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_answer: str
    marks: int
    is_active: bool

class QuotaSettingsUpdate(BaseModel):
    quota_easy: int = Field(..., ge=1)
    quota_medium: int = Field(..., ge=1)
    quota_hard: int = Field(..., ge=1)

class TextImportRequest(BaseModel):
    raw_text: str = Field(..., min_length=1)
    overwrite: bool = False


# ─── Helpers ───

def normalize_header(h: str) -> str:
    """Normalize CSV headers removing underscores, spaces, hyphens and lowercasing."""
    return re.sub(r'[^a-z0-9]', '', str(h).lower()) if h else ""

def parse_int_safe(val: Any, default: int = 1) -> int:
    try:
        return int(float(str(val).strip()))
    except Exception:
        return default


# ─── Endpoints ───

@router.get("", response_model=List[L2QuestionAdminOut])
async def list_l2_questions(
    academic_year: Optional[int] = Query(None, ge=2, le=3, description="Filter by Academic Year 2 or 3"),
    difficulty: Optional[str] = Query(None, description="easy, medium, hard"),
    search: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """List all Level 2 Debugging questions with optional filters."""
    query = select(L2Question)
    if academic_year:
        query = query.where(L2Question.academic_year == academic_year)
    if difficulty:
        query = query.where(L2Question.difficulty == difficulty.lower().strip())
    if search:
        s = f"%{search.strip()}%"
        query = query.where(
            (L2Question.question_id.ilike(s)) |
            (L2Question.question.ilike(s)) |
            (L2Question.code.ilike(s))
        )
    query = query.order_by(L2Question.academic_year.asc(), L2Question.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/pool-stats")
async def get_l2_pool_stats(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Get pool question counts broken down by academic year and difficulty.
    Includes active quotas and readiness flags.
    """
    # Fetch quotas from settings (default 3, 3, 2)
    q_easy = await db.execute(select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_easy"))
    q_med = await db.execute(select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_medium"))
    q_hard = await db.execute(select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_hard"))

    val_e = q_easy.scalar_one_or_none()
    val_m = q_med.scalar_one_or_none()
    val_h = q_hard.scalar_one_or_none()

    quota_easy = int(val_e) if val_e and int(val_e) > 0 else 3
    quota_medium = int(val_m) if val_m and int(val_m) > 0 else 3
    quota_hard = int(val_h) if val_h and int(val_h) > 0 else 2
    quota_total = quota_easy + quota_medium + quota_hard

    # Fetch active questions
    result = await db.execute(select(L2Question).where(L2Question.is_active == True))
    questions = result.scalars().all()

    stats = {
        2: {"easy": 0, "medium": 0, "hard": 0, "total": 0},
        3: {"easy": 0, "medium": 0, "hard": 0, "total": 0}
    }
    overall = {"easy": 0, "medium": 0, "hard": 0, "total": 0}

    for q in questions:
        yr = q.academic_year
        diff = q.difficulty.lower().strip()
        if diff not in ("easy", "medium", "hard"):
            diff = "medium"

        if yr in stats:
            stats[yr][diff] = stats[yr].get(diff, 0) + 1
            stats[yr]["total"] += 1

        overall[diff] = overall.get(diff, 0) + 1
        overall["total"] += 1

    ready_2 = (
        stats[2]["easy"] >= quota_easy and
        stats[2]["medium"] >= quota_medium and
        stats[2]["hard"] >= quota_hard
    )
    ready_3 = (
        stats[3]["easy"] >= quota_easy and
        stats[3]["medium"] >= quota_medium and
        stats[3]["hard"] >= quota_hard
    )

    return {
        "quotas": {
            "easy": quota_easy,
            "medium": quota_medium,
            "hard": quota_hard,
            "total": quota_total
        },
        "year_2": stats[2],
        "year_3": stats[3],
        "overall": overall,
        "is_ready_year_2": ready_2,
        "is_ready_year_3": ready_3,
    }


@router.post("/quotas")
async def update_l2_quotas(
    payload: QuotaSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Update question assignment quotas for Level 2 Debugging Challenge."""
    for key, val in [
        ("l2_quota_easy", str(payload.quota_easy)),
        ("l2_quota_medium", str(payload.quota_medium)),
        ("l2_quota_hard", str(payload.quota_hard)),
    ]:
        res = await db.execute(select(CompetitionSetting).where(CompetitionSetting.key == key))
        setting = res.scalar_one_or_none()
        if setting:
            setting.value = val
        else:
            db.add(CompetitionSetting(key=key, value=val))

    await db.commit()
    return {"message": "Level 2 quotas updated successfully.", "quotas": payload.dict()}


def parse_questions_content(
    raw_text: str,
    existing_db_ids: set,
    overwrite: bool = False
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
    """
    Parse CSV, TSV, or spreadsheet text content.
    Auto-detects delimiter (\t, ,, or ;).
    Supports header alias normalization and fallback positional column mapping.
    Validates academic_year (2 or 3 only), difficulty, correct_answer, and required fields.
    """
    cleaned_text = raw_text.strip()
    if not cleaned_text:
        return [], [], 0

    first_line = cleaned_text.splitlines()[0] if cleaned_text.splitlines() else ""
    if "\t" in first_line:
        delim = "\t"
    elif ";" in first_line:
        delim = ";"
    else:
        delim = ","

    reader = list(csv.reader(io.StringIO(cleaned_text), delimiter=delim))
    if not reader:
        return [], [], 0

    alias_map = {
        "question_id": ["questionid", "qid", "id"],
        "academic_year": ["academicyear", "year", "class", "academicyearid"],
        "language": ["language", "lang"],
        "difficulty": ["difficulty", "diff", "level"],
        "question": ["question", "questiontext", "prompt", "title", "description"],
        "code": ["code", "snippet", "codesnippet", "program"],
        "option_a": ["optiona", "opta", "a"],
        "option_b": ["optionb", "optb", "b"],
        "option_c": ["optionc", "optc", "c"],
        "option_d": ["optiond", "optd", "d"],
        "correct_answer": ["correctanswer", "correct", "answer", "ans"],
        "marks": ["marks", "mark", "score", "points"],
    }

    first_row = [normalize_header(c) for c in reader[0]]
    header_indices: Dict[str, int] = {}
    is_header = False

    for idx, col in enumerate(first_row):
        for field, aliases in alias_map.items():
            if col == normalize_header(field) or col in aliases:
                header_indices[field] = idx
                is_header = True
                break

    start_idx = 1 if is_header else 0
    if not is_header:
        default_cols = [
            "question_id", "academic_year", "language", "difficulty",
            "question", "code", "option_a", "option_b", "option_c", "option_d",
            "correct_answer", "marks"
        ]
        for idx, col_name in enumerate(default_cols):
            header_indices[col_name] = idx

    seen_batch_ids = set()
    valid_rows = []
    errors = []

    for row_num, row in enumerate(reader[start_idx:], start=start_idx + 1):
        if not row or not any(c.strip() for c in row):
            continue

        def get_val(fld: str, default: str = "") -> str:
            idx = header_indices.get(fld)
            if idx is not None and idx < len(row):
                return row[idx].strip()
            return default

        qid = get_val("question_id")
        year_raw = get_val("academic_year")
        lang = get_val("language", "python").lower() or "python"
        diff = get_val("difficulty", "medium").lower() or "medium"
        q_text = get_val("question")
        code = get_val("code")
        opt_a = get_val("option_a")
        opt_b = get_val("option_b")
        opt_c = get_val("option_c")
        opt_d = get_val("option_d")
        ans = get_val("correct_answer").lower()
        marks_raw = get_val("marks", "1")

        row_errors = []

        if not qid:
            row_errors.append("question_id is required")
        elif qid in seen_batch_ids:
            row_errors.append(f"Duplicate question_id '{qid}' in batch")
        elif (not overwrite) and (qid in existing_db_ids):
            row_errors.append(f"question_id '{qid}' already exists in database")
        else:
            seen_batch_ids.add(qid)

        try:
            year = int(float(year_raw))
            if year not in (2, 3):
                row_errors.append(f"academic_year must be 2 or 3 (got '{year_raw}')")
        except Exception:
            row_errors.append(f"Invalid academic_year '{year_raw}'. Must be 2 or 3")
            year = 2

        if diff not in ("easy", "medium", "hard"):
            row_errors.append(f"Invalid difficulty '{diff}'. Must be easy, medium, or hard")
            diff = "medium"

        if not q_text:
            row_errors.append("Question text cannot be empty")
        if not code:
            row_errors.append("Code snippet cannot be empty")
        if not opt_a or not opt_b or not opt_c or not opt_d:
            row_errors.append("All 4 options (a, b, c, d) must be filled")

        if ans not in ("a", "b", "c", "d"):
            row_errors.append(f"correct_answer must be 'a', 'b', 'c', or 'd' (got '{ans}')")

        marks = parse_int_safe(marks_raw, default=1)
        if marks < 1:
            marks = 1

        if row_errors:
            errors.append({
                "row_number": row_num,
                "question_id": qid or f"Row-{row_num}",
                "error": "; ".join(row_errors)
            })
        else:
            valid_rows.append({
                "question_id": qid,
                "academic_year": year,
                "language": lang,
                "difficulty": diff,
                "question": q_text,
                "code": code,
                "option_a": opt_a,
                "option_b": opt_b,
                "option_c": opt_c,
                "option_d": opt_d,
                "correct_answer": ans,
                "marks": marks
            })

    total_valid_and_invalid = len(valid_rows) + len(errors)
    return valid_rows, errors, total_valid_and_invalid


@router.post("/preview-csv")
async def preview_csv_import(
    file: UploadFile = File(...),
    overwrite: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Parse and pre-validate uploaded CSV/TSV file."""
    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = content.decode("cp1252", errors="replace")

    db_ids_res = await db.execute(select(L2Question.question_id))
    existing_db_ids = set(db_ids_res.scalars().all())

    valid_rows, errors, total_count = parse_questions_content(decoded, existing_db_ids, overwrite=overwrite)
    return {
        "total_rows": total_count,
        "valid_rows_count": len(valid_rows),
        "invalid_rows_count": len(errors),
        "errors": errors,
        "preview": valid_rows[:25]
    }


@router.post("/preview-text")
async def preview_text_import(
    payload: TextImportRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Parse and pre-validate raw pasted CSV/TSV or Excel table text."""
    db_ids_res = await db.execute(select(L2Question.question_id))
    existing_db_ids = set(db_ids_res.scalars().all())

    valid_rows, errors, total_count = parse_questions_content(payload.raw_text, existing_db_ids, overwrite=payload.overwrite)
    return {
        "total_rows": total_count,
        "valid_rows_count": len(valid_rows),
        "invalid_rows_count": len(errors),
        "errors": errors,
        "preview": valid_rows[:25]
    }


@router.post("/import")
async def import_csv_questions(
    file: UploadFile = File(...),
    overwrite: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Import questions from uploaded CSV/TSV file."""
    content = await file.read()
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = content.decode("cp1252", errors="replace")

    db_ids_res = await db.execute(select(L2Question.question_id))
    existing_db_ids = set(db_ids_res.scalars().all())

    valid_rows, errors, _ = parse_questions_content(decoded, existing_db_ids, overwrite=overwrite)
    if not valid_rows:
        return {
            "message": f"No valid questions to import. {len(errors)} rows had validation errors.",
            "imported": 0,
            "skipped": len(errors),
            "errors": errors
        }

    imported_count = 0
    updated_count = 0

    for r in valid_rows:
        if overwrite and r["question_id"] in existing_db_ids:
            res = await db.execute(select(L2Question).where(L2Question.question_id == r["question_id"]))
            q = res.scalar_one_or_none()
            if q:
                q.academic_year = r["academic_year"]
                q.language = r["language"]
                q.difficulty = r["difficulty"]
                q.question = r["question"]
                q.code = r["code"]
                q.option_a = r["option_a"]
                q.option_b = r["option_b"]
                q.option_c = r["option_c"]
                q.option_d = r["option_d"]
                q.correct_answer = r["correct_answer"]
                q.marks = r["marks"]
                q.is_active = True
                updated_count += 1
                continue

        q = L2Question(
            question_id=r["question_id"],
            academic_year=r["academic_year"],
            language=r["language"],
            difficulty=r["difficulty"],
            question=r["question"],
            code=r["code"],
            option_a=r["option_a"],
            option_b=r["option_b"],
            option_c=r["option_c"],
            option_d=r["option_d"],
            correct_answer=r["correct_answer"],
            marks=r["marks"],
            is_active=True
        )
        db.add(q)
        existing_db_ids.add(r["question_id"])
        imported_count += 1

    await db.commit()
    msg = f"Import completed: {imported_count} new imported"
    if updated_count > 0:
        msg += f", {updated_count} updated"
    msg += f", {len(errors)} skipped."

    return {
        "message": msg,
        "imported": imported_count,
        "updated": updated_count,
        "skipped": len(errors),
        "errors": errors
    }


@router.post("/import-text")
async def import_text_questions(
    payload: TextImportRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Import questions by directly pasting spreadsheet rows (tab or comma separated)."""
    db_ids_res = await db.execute(select(L2Question.question_id))
    existing_db_ids = set(db_ids_res.scalars().all())

    valid_rows, errors, _ = parse_questions_content(payload.raw_text, existing_db_ids, overwrite=payload.overwrite)
    if not valid_rows:
        return {
            "message": f"No valid questions to import. {len(errors)} rows had validation errors.",
            "imported": 0,
            "skipped": len(errors),
            "errors": errors
        }

    imported_count = 0
    updated_count = 0

    for r in valid_rows:
        if payload.overwrite and r["question_id"] in existing_db_ids:
            res = await db.execute(select(L2Question).where(L2Question.question_id == r["question_id"]))
            q = res.scalar_one_or_none()
            if q:
                q.academic_year = r["academic_year"]
                q.language = r["language"]
                q.difficulty = r["difficulty"]
                q.question = r["question"]
                q.code = r["code"]
                q.option_a = r["option_a"]
                q.option_b = r["option_b"]
                q.option_c = r["option_c"]
                q.option_d = r["option_d"]
                q.correct_answer = r["correct_answer"]
                q.marks = r["marks"]
                q.is_active = True
                updated_count += 1
                continue

        q = L2Question(
            question_id=r["question_id"],
            academic_year=r["academic_year"],
            language=r["language"],
            difficulty=r["difficulty"],
            question=r["question"],
            code=r["code"],
            option_a=r["option_a"],
            option_b=r["option_b"],
            option_c=r["option_c"],
            option_d=r["option_d"],
            correct_answer=r["correct_answer"],
            marks=r["marks"],
            is_active=True
        )
        db.add(q)
        existing_db_ids.add(r["question_id"])
        imported_count += 1

    await db.commit()
    msg = f"Import completed: {imported_count} new imported"
    if updated_count > 0:
        msg += f", {updated_count} updated"
    msg += f", {len(errors)} skipped."

    return {
        "message": msg,
        "imported": imported_count,
        "updated": updated_count,
        "skipped": len(errors),
        "errors": errors
    }


@router.post("/seed-demo")
async def seed_demo_questions(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Seed 16 competition-grade debugging questions (8 for Year 2, 8 for Year 3).
    Instantly satisfies all default quotas (3 Easy, 3 Medium, 2 Hard) for both cohorts.
    """
    demo_questions = [
        # ──────── YEAR 2 QUESTIONS (13 items: 5 Easy, 5 Medium, 3 Hard) ────────
        {
            "question_id": "L2_Y2_E01",
            "academic_year": 2,
            "language": "python",
            "difficulty": "easy",
            "question": "Identify the missing conditional statement to correctly sum all even numbers.",
            "code": "def sum_even_numbers(numbers):\n    total = 0\n    for num in numbers:\n        // [ MISSING LINE HERE ]\n            total += num\n    return total",
            "option_a": "if num % 2 == 0:",
            "option_b": "if num % 2 != 0:",
            "option_c": "if total % 2 == 0:",
            "option_d": "if num > 0:",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y2_E02",
            "academic_year": 2,
            "language": "c",
            "difficulty": "easy",
            "question": "Find the missing loop condition to calculate the length of a null-terminated string.",
            "code": "int get_length(const char *str) {\n    int len = 0;\n    // [ MISSING LINE HERE ]\n        len++;\n    return len;\n}",
            "option_a": "while (str[len] != '\\0')",
            "option_b": "while (str[len] == '\\0')",
            "option_c": "while (len < sizeof(str))",
            "option_d": "while (str != NULL)",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y2_E03",
            "academic_year": 2,
            "language": "python",
            "difficulty": "easy",
            "question": "Complete the search function to locate the maximum value in a non-empty list.",
            "code": "def find_max(items):\n    current_max = items[0]\n    for x in items[1:]:\n        // [ MISSING LINE HERE ]\n            current_max = x\n    return current_max",
            "option_a": "if x > current_max:",
            "option_b": "if x < current_max:",
            "option_c": "if x == current_max:",
            "option_d": "if current_max is None:",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y2_E04",
            "academic_year": 2,
            "language": "python",
            "difficulty": "easy",
            "question": "Identify the missing statement to count vowels in an English word.",
            "code": "def count_vowels(word):\n    count = 0\n    for ch in word.lower():\n        // [ MISSING LINE HERE ]\n            count += 1\n    return count",
            "option_a": "if ch in 'aeiou':",
            "option_b": "if ch not in 'aeiou':",
            "option_c": "if ch == 'aeiou':",
            "option_d": "if 'aeiou' in word:",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y2_E05",
            "academic_year": 2,
            "language": "c",
            "difficulty": "easy",
            "question": "Supply the missing loop header to print numbers from 1 to n inclusive.",
            "code": "void print_1_to_n(int n) {\n    // [ MISSING LINE HERE ]\n        printf(\"%d \", i);\n}",
            "option_a": "for (int i = 1; i <= n; i++)",
            "option_b": "for (int i = 0; i < n; i++)",
            "option_c": "for (int i = 1; i < n; i++)",
            "option_d": "for (int i = n; i >= 1; i--)",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y2_M01",
            "academic_year": 2,
            "language": "python",
            "difficulty": "medium",
            "question": "Supply the missing two-pointer swap line to reverse an array in-place.",
            "code": "def reverse_in_place(arr):\n    left = 0\n    right = len(arr) - 1\n    while left < right:\n        // [ MISSING LINE HERE ]\n        left += 1\n        right -= 1\n    return arr",
            "option_a": "arr[left], arr[right] = arr[right], arr[left]",
            "option_b": "arr[left] = arr[right]",
            "option_c": "arr.swap(left, right)",
            "option_d": "arr[right], arr[left] = arr[left], arr[left]",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y2_M02",
            "academic_year": 2,
            "language": "python",
            "difficulty": "medium",
            "question": "Identify the missing reversal line to check if a phrase is a valid palindrome.",
            "code": "def is_palindrome(s):\n    cleaned = \"\".join(ch.lower() for ch in s if ch.isalnum())\n    // [ MISSING LINE HERE ]\n    return cleaned == reversed_str",
            "option_a": "reversed_str = cleaned[::-1]",
            "option_b": "reversed_str = cleaned.reverse()",
            "option_c": "reversed_str = s[::-1]",
            "option_d": "reversed_str = str(reversed(s))",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y2_M03",
            "academic_year": 2,
            "language": "c",
            "difficulty": "medium",
            "question": "Fix the recursive factorial function by supplying the missing termination base case.",
            "code": "long long factorial(int n) {\n    // [ MISSING LINE HERE ]\n        return 1;\n    return n * factorial(n - 1);\n}",
            "option_a": "if (n <= 1)",
            "option_b": "if (n == 2)",
            "option_c": "if (n > 1)",
            "option_d": "if (factorial(n) == 1)",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y2_M04",
            "academic_year": 2,
            "language": "python",
            "difficulty": "medium",
            "question": "Choose the missing condition to remove consecutive duplicates from a sorted list.",
            "code": "def remove_consecutive_duplicates(nums):\n    if not nums: return []\n    res = [nums[0]]\n    for i in range(1, len(nums)):\n        // [ MISSING LINE HERE ]\n            res.append(nums[i])\n    return res",
            "option_a": "if nums[i] != nums[i - 1]:",
            "option_b": "if nums[i] == nums[i - 1]:",
            "option_c": "if nums[i] not in nums:",
            "option_d": "if nums[i] > nums[i - 1]:",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y2_M05",
            "academic_year": 2,
            "language": "python",
            "difficulty": "medium",
            "question": "Complete the memoized Fibonacci function to retrieve cached results.",
            "code": "def fib(n, memo={}):\n    // [ MISSING LINE HERE ]\n    if n <= 1: return n\n    memo[n] = fib(n - 1, memo) + fib(n - 2, memo)\n    return memo[n]",
            "option_a": "if n in memo: return memo[n]",
            "option_b": "if n not in memo: return n",
            "option_c": "if memo is None: memo = {}",
            "option_d": "memo[n] = n",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y2_H01",
            "academic_year": 2,
            "language": "python",
            "difficulty": "hard",
            "question": "Complete the two-pointer merge step for two sorted lists.",
            "code": "def merge_sorted(a, b):\n    result = []\n    i = j = 0\n    while i < len(a) and j < len(b):\n        if a[i] <= b[j]:\n            // [ MISSING LINE HERE ]\n        else:\n            result.append(b[j])\n            j += 1\n    result.extend(a[i:])\n    result.extend(b[j:])\n    return result",
            "option_a": "result.append(a[i]); i += 1",
            "option_b": "result.append(b[j]); i += 1",
            "option_c": "result.append(a[i]); j += 1",
            "option_d": "a.pop(i); result.append(a[i])",
            "correct_answer": "a",
            "marks": 3
        },
        {
            "question_id": "L2_Y2_H02",
            "academic_year": 2,
            "language": "python",
            "difficulty": "hard",
            "question": "Identify the missing local sum update in Kadane's Algorithm for Maximum Subarray.",
            "code": "def max_subarray(nums):\n    max_so_far = nums[0]\n    current_max = nums[0]\n    for x in nums[1:]:\n        // [ MISSING LINE HERE ]\n        max_so_far = max(max_so_far, current_max)\n    return max_so_far",
            "option_a": "current_max = max(x, current_max + x)",
            "option_b": "current_max = max(max_so_far, x)",
            "option_c": "current_max += x",
            "option_d": "current_max = max(0, current_max)",
            "correct_answer": "a",
            "marks": 3
        },
        {
            "question_id": "L2_Y2_H03",
            "academic_year": 2,
            "language": "c",
            "difficulty": "hard",
            "question": "Complete Floyd's Cycle-Finding step to advance slow and fast pointers in a singly-linked list.",
            "code": "bool has_cycle(Node *head) {\n    Node *slow = head, *fast = head;\n    while (fast && fast->next) {\n        // [ MISSING LINE HERE ]\n        if (slow == fast) return true;\n    }\n    return false;\n}",
            "option_a": "slow = slow->next; fast = fast->next->next;",
            "option_b": "slow = slow->next; fast = fast->next;",
            "option_c": "slow = fast; fast = slow->next;",
            "option_d": "fast = fast->next->next; slow = fast;",
            "correct_answer": "a",
            "marks": 3
        },

        # ──────── YEAR 3 QUESTIONS (13 items: 5 Easy, 5 Medium, 3 Hard) ────────
        {
            "question_id": "L2_Y3_E01",
            "academic_year": 3,
            "language": "python",
            "difficulty": "easy",
            "question": "Choose the correct overflow-safe midpoint calculation in binary search.",
            "code": "def binary_search(arr, target):\n    low = 0\n    high = len(arr) - 1\n    while low <= high:\n        // [ MISSING LINE HERE ]\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1",
            "option_a": "mid = low + (high - low) // 2",
            "option_b": "mid = (low + high) * 2",
            "option_c": "mid = high - (low // 2)",
            "option_d": "mid = (high - low) // 2",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y3_E02",
            "academic_year": 3,
            "language": "java",
            "difficulty": "easy",
            "question": "Supply the missing line to update element frequency inside a Java Map.",
            "code": "public void countFrequency(int[] nums, Map<Integer, Integer> freq) {\n    for (int n : nums) {\n        // [ MISSING LINE HERE ]\n    }\n}",
            "option_a": "freq.put(n, freq.getOrDefault(n, 0) + 1);",
            "option_b": "freq.put(n, freq.get(n) + 1);",
            "option_c": "freq.add(n, 1);",
            "option_d": "freq.put(n, 0);",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y3_E03",
            "academic_year": 3,
            "language": "python",
            "difficulty": "easy",
            "question": "Complete the search loop to return the index of the first matching character.",
            "code": "def first_index(s, target):\n    for i, ch in enumerate(s):\n        // [ MISSING LINE HERE ]\n            return i\n    return -1",
            "option_a": "if ch == target:",
            "option_b": "if s[i] != target:",
            "option_c": "if target in ch:",
            "option_d": "if i == target:",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y3_E04",
            "academic_year": 3,
            "language": "java",
            "difficulty": "easy",
            "question": "Identify the standard null and empty check for an incoming string in Java.",
            "code": "public boolean isBlankString(String str) {\n    // [ MISSING LINE HERE ]\n        return true;\n    return false;\n}",
            "option_a": "if (str == null || str.trim().isEmpty())",
            "option_b": "if (str.length() == 0 || str != null)",
            "option_c": "if (str == \"\")",
            "option_d": "if (str.equals(null))",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y3_E05",
            "academic_year": 3,
            "language": "python",
            "difficulty": "easy",
            "question": "Complete the binary search step to locate the minimum element in a rotated sorted array without duplicates.",
            "code": "def find_min(nums):\n    low, high = 0, len(nums) - 1\n    while low < high:\n        mid = (low + high) // 2\n        // [ MISSING LINE HERE ]\n            low = mid + 1\n        else:\n            high = mid\n    return nums[low]",
            "option_a": "if nums[mid] > nums[high]:",
            "option_b": "if nums[mid] < nums[high]:",
            "option_c": "if nums[mid] == nums[low]:",
            "option_d": "if nums[mid] > nums[low]:",
            "correct_answer": "a",
            "marks": 1
        },
        {
            "question_id": "L2_Y3_M01",
            "academic_year": 3,
            "language": "python",
            "difficulty": "medium",
            "question": "Supply the missing lookup check for one-pass Two Sum using a hash map.",
            "code": "def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        // [ MISSING LINE HERE ]\n            return [seen[complement], i]\n        seen[num] = i\n    return []",
            "option_a": "if complement in seen:",
            "option_b": "if complement not in seen:",
            "option_c": "if target in seen:",
            "option_d": "if num in seen:",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y3_M02",
            "academic_year": 3,
            "language": "java",
            "difficulty": "medium",
            "question": "Complete the bracket matching algorithm by checking stack state when encountering a closing brace.",
            "code": "public boolean isValid(String s) {\n    Stack<Character> stack = new Stack<>();\n    for (char c : s.toCharArray()) {\n        if (c == '(') stack.push(')');\n        else if (c == '{') stack.push('}');\n        else if (c == '[') stack.push(']');\n        // [ MISSING LINE HERE ]\n            return false;\n    }\n    return stack.isEmpty();\n}",
            "option_a": "else if (stack.isEmpty() || stack.pop() != c)",
            "option_b": "else if (stack.peek() == c)",
            "option_c": "else if (!stack.isEmpty())",
            "option_d": "else if (stack.pop() == c)",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y3_M03",
            "academic_year": 3,
            "language": "python",
            "difficulty": "medium",
            "question": "Complete the queue extraction step in Breadth-First Search (BFS).",
            "code": "from collections import deque\n\ndef bfs(graph, start):\n    visited = {start}\n    queue = deque([start])\n    traversal = []\n    while queue:\n        // [ MISSING LINE HERE ]\n        traversal.append(node)\n        for neighbor in graph.get(node, []):\n            if neighbor not in visited:\n                visited.add(neighbor)\n                queue.append(neighbor)\n    return traversal",
            "option_a": "node = queue.popleft()",
            "option_b": "node = queue.pop()",
            "option_c": "node = queue[0]",
            "option_d": "node = deque.pop(queue)",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y3_M04",
            "academic_year": 3,
            "language": "java",
            "difficulty": "medium",
            "question": "Identify the recursive cycle detection check in a directed graph using DFS recursion stack.",
            "code": "boolean isCyclicUtil(int i, boolean[] visited, boolean[] recStack, List<List<Integer>> adj) {\n    if (recStack[i]) return true;\n    if (visited[i]) return false;\n    visited[i] = true;\n    recStack[i] = true;\n    for (Integer c : adj.get(i)) {\n        // [ MISSING LINE HERE ]\n            return true;\n    }\n    recStack[i] = false;\n    return false;\n}",
            "option_a": "if (isCyclicUtil(c, visited, recStack, adj))",
            "option_b": "if (visited[c])",
            "option_c": "if (!recStack[c])",
            "option_d": "if (c == i)",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y3_M05",
            "academic_year": 3,
            "language": "python",
            "difficulty": "medium",
            "question": "Supply the two-pointer adjustment in 3Sum when a triplet sum matches target zero.",
            "code": "def three_sum(nums):\n    nums.sort()\n    res = []\n    for i in range(len(nums) - 2):\n        if i > 0 and nums[i] == nums[i - 1]: continue\n        l, r = i + 1, len(nums) - 1\n        while l < r:\n            s = nums[i] + nums[l] + nums[r]\n            if s == 0:\n                res.append([nums[i], nums[l], nums[r]])\n                // [ MISSING LINE HERE ]\n            elif s < 0: l += 1\n            else: r -= 1\n    return res",
            "option_a": "l += 1; r -= 1",
            "option_b": "l += 1",
            "option_c": "r -= 1",
            "option_d": "break",
            "correct_answer": "a",
            "marks": 2
        },
        {
            "question_id": "L2_Y3_H01",
            "academic_year": 3,
            "language": "python",
            "difficulty": "hard",
            "question": "Complete the left pointer update for Longest Substring Without Repeating Characters.",
            "code": "def length_of_longest_substring(s):\n    char_map = {}\n    left = 0\n    max_len = 0\n    for right, char in enumerate(s):\n        if char in char_map and char_map[char] >= left:\n            // [ MISSING LINE HERE ]\n        char_map[char] = right\n        max_len = max(max_len, right - left + 1)\n    return max_len",
            "option_a": "left = char_map[char] + 1",
            "option_b": "left = right - 1",
            "option_c": "left = char_map[char]",
            "option_d": "right = left + 1",
            "correct_answer": "a",
            "marks": 3
        },
        {
            "question_id": "L2_Y3_H02",
            "academic_year": 3,
            "language": "java",
            "difficulty": "hard",
            "question": "Supply the final pivot positioning swap in Lomuto QuickSort Partition.",
            "code": "int partition(int[] arr, int low, int high) {\n    int pivot = arr[high];\n    int i = low - 1;\n    for (int j = low; j < high; j++) {\n        if (arr[j] <= pivot) {\n            i++;\n            swap(arr, i, j);\n        }\n    }\n    // [ MISSING LINE HERE ]\n    return i + 1;\n}",
            "option_a": "swap(arr, i + 1, high);",
            "option_b": "swap(arr, low, high);",
            "option_c": "swap(arr, i, high);",
            "option_d": "arr[i + 1] = pivot;",
            "correct_answer": "a",
            "marks": 3
        },
        {
            "question_id": "L2_Y3_H03",
            "academic_year": 3,
            "language": "python",
            "difficulty": "hard",
            "question": "Complete the Lowest Common Ancestor (LCA) decision for a binary tree.",
            "code": "def lowest_common_ancestor(root, p, q):\n    if not root or root == p or root == q: return root\n    left = lowest_common_ancestor(root.left, p, q)\n    right = lowest_common_ancestor(root.right, p, q)\n    // [ MISSING LINE HERE ]\n    return left if left else right",
            "option_a": "if left and right: return root",
            "option_b": "if not left and not right: return root",
            "option_c": "if left: return left",
            "option_d": "if right: return right",
            "correct_answer": "a",
            "marks": 3
        }
    ]

    # Ensure standard quotas (3 easy, 3 medium, 2 hard) are configured
    for qk, qv in [("l2_quota_easy", "3"), ("l2_quota_medium", "3"), ("l2_quota_hard", "2")]:
        q_res = await db.execute(select(CompetitionSetting).where(CompetitionSetting.key == qk))
        q_setting = q_res.scalar_one_or_none()
        if not q_setting:
            db.add(CompetitionSetting(key=qk, value=qv))

    seeded_count = 0
    for q_data in demo_questions:
        res = await db.execute(select(L2Question).where(L2Question.question_id == q_data["question_id"]))
        existing = res.scalar_one_or_none()
        if existing:
            for k, v in q_data.items():
                setattr(existing, k, v)
            existing.is_active = True
        else:
            new_q = L2Question(**q_data, is_active=True)
            db.add(new_q)
            seeded_count += 1

    await db.commit()
    return {
        "message": f"Successfully seeded {len(demo_questions)} demo questions (13 for Year 2, 13 for Year 3). Pool quotas are 100% satisfied!",
        "count": len(demo_questions)
    }



@router.post("", response_model=L2QuestionAdminOut)
async def create_single_question(
    payload: L2QuestionAdminCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Create a single Level 2 Debugging Question."""
    existing = await db.execute(select(L2Question).where(L2Question.question_id == payload.question_id.strip()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"question_id '{payload.question_id}' already exists.")

    q = L2Question(
        question_id=payload.question_id.strip(),
        academic_year=payload.academic_year,
        language=payload.language.strip().lower(),
        difficulty=payload.difficulty.strip().lower(),
        question=payload.question.strip(),
        code=payload.code.strip(),
        option_a=payload.option_a.strip(),
        option_b=payload.option_b.strip(),
        option_c=payload.option_c.strip(),
        option_d=payload.option_d.strip(),
        correct_answer=payload.correct_answer.strip().lower(),
        marks=payload.marks,
        is_active=payload.is_active
    )
    db.add(q)
    await db.commit()
    await db.refresh(q)
    return q


@router.put("/{question_id}", response_model=L2QuestionAdminOut)
async def update_single_question(
    question_id: str,
    payload: L2QuestionAdminUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Update a Level 2 question by id or question_id."""
    res = await db.execute(
        select(L2Question).where(
            (L2Question.id == question_id) | (L2Question.question_id == question_id)
        )
    )
    q = res.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")

    if payload.academic_year is not None:
        q.academic_year = payload.academic_year
    if payload.language is not None:
        q.language = payload.language.strip().lower()
    if payload.difficulty is not None:
        q.difficulty = payload.difficulty.strip().lower()
    if payload.question is not None:
        q.question = payload.question.strip()
    if payload.code is not None:
        q.code = payload.code.strip()
    if payload.option_a is not None:
        q.option_a = payload.option_a.strip()
    if payload.option_b is not None:
        q.option_b = payload.option_b.strip()
    if payload.option_c is not None:
        q.option_c = payload.option_c.strip()
    if payload.option_d is not None:
        q.option_d = payload.option_d.strip()
    if payload.correct_answer is not None:
        q.correct_answer = payload.correct_answer.strip().lower()
    if payload.marks is not None:
        q.marks = payload.marks
    if payload.is_active is not None:
        q.is_active = payload.is_active

    await db.commit()
    await db.refresh(q)
    return q


@router.delete("/{question_id}")
async def delete_single_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Delete a Level 2 question by id or question_id."""
    res = await db.execute(
        select(L2Question).where(
            (L2Question.id == question_id) | (L2Question.question_id == question_id)
        )
    )
    q = res.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")

    await db.delete(q)
    await db.commit()
    return {"message": f"Question '{q.question_id}' deleted successfully."}


@router.delete("")
async def bulk_delete_questions(
    academic_year: Optional[int] = Query(None, ge=2, le=3),
    confirm: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """Bulk delete questions (optionally for a specific year). Requires confirm=true."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to confirm bulk deletion.")

    stmt = delete(L2Question)
    if academic_year:
        stmt = stmt.where(L2Question.academic_year == academic_year)
    result = await db.execute(stmt)
    await db.commit()
    return {"message": f"Deleted {result.rowcount} questions."}
