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
    # Fetch quotas from settings (default 5, 5, 5 = 15 total)
    q_easy = await db.execute(select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_easy"))
    q_med = await db.execute(select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_medium"))
    q_hard = await db.execute(select(CompetitionSetting.value).where(CompetitionSetting.key == "l2_quota_hard"))

    val_e = q_easy.scalar_one_or_none()
    val_m = q_med.scalar_one_or_none()
    val_h = q_hard.scalar_one_or_none()

    quota_easy = int(val_e) if val_e and int(val_e) > 0 else 5
    quota_medium = int(val_m) if val_m and int(val_m) > 0 else 5
    quota_hard = int(val_h) if val_h and int(val_h) > 0 else 5
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

        default_marks = 1 if diff == "easy" else (3 if diff == "medium" else 5)
        marks = parse_int_safe(marks_raw, default=default_marks)
        if marks < 1:
            marks = default_marks

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
    # ════════════════════ YEAR 2 QUESTIONS (15 total: 5 Easy @ 1m, 5 Med @ 3m, 5 Hard @ 5m) ════════════════════
    # --- EASY (5 questions, 1 mark each) ---
    {
        "question_id": "L2_Y2_E01",
        "academic_year": 2,
        "language": "python",
        "difficulty": "easy",
        "marks": 1,
        "question": "Identify the missing conditional statement to correctly sum all even numbers.",
        "code": "def sum_even_numbers(numbers):
    total = 0
    for num in numbers:
        // [ MISSING LINE HERE ]
            total += num
    return total",
        "option_a": "if num % 2 == 0:",
        "option_b": "if num % 2 != 0:",
        "option_c": "if total % 2 == 0:",
        "option_d": "if num > 0:",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_E02",
        "academic_year": 2,
        "language": "c",
        "difficulty": "easy",
        "marks": 1,
        "question": "Find the missing loop condition to calculate the length of a null-terminated string.",
        "code": "int get_length(const char *str) {
    int len = 0;
    // [ MISSING LINE HERE ]
        len++;
    return len;
}",
        "option_a": "while (str[len] != '\0')",
        "option_b": "while (str[len] == '\0')",
        "option_c": "while (len != NULL)",
        "option_d": "while (*str != 0)",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_E03",
        "academic_year": 2,
        "language": "python",
        "difficulty": "easy",
        "marks": 1,
        "question": "Predict the output of the following Python program involving list references:",
        "code": "nums = [1, 2, 3]
ref = nums
ref.append(4)
print(len(nums))",
        "option_a": "4",
        "option_b": "3",
        "option_c": "[1, 2, 3, 4]",
        "option_d": "AttributeError",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_E04",
        "academic_year": 2,
        "language": "c",
        "difficulty": "easy",
        "marks": 1,
        "question": "What is the output of the following integer division and format print in C?",
        "code": "#include <stdio.h>
int main() {
    int a = 5, b = 2;
    float c = a / b;
    printf(\"%.1f\", c);
    return 0;
}",
        "option_a": "2.0",
        "option_b": "2.5",
        "option_c": "2",
        "option_d": "2.50",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_E05",
        "academic_year": 2,
        "language": "python",
        "difficulty": "easy",
        "marks": 1,
        "question": "Supply the missing update check to find the maximum element in the list:",
        "code": "def find_max(numbers):
    max_val = numbers[0]
    for val in numbers[1:]:
        // [ MISSING LINE HERE ]
            max_val = val
    return max_val",
        "option_a": "if val > max_val:",
        "option_b": "if val < max_val:",
        "option_c": "if val == max_val:",
        "option_d": "if max_val > 0:",
        "correct_answer": "a",
        "is_active": True
    },

    # --- MEDIUM (5 questions, 3 marks each) ---
    {
        "question_id": "L2_Y2_M01",
        "academic_year": 2,
        "language": "python",
        "difficulty": "medium",
        "marks": 3,
        "question": "Identify the missing print statement to output a right-angled star triangle of height n (*, **, ***, ...):",
        "code": "def print_star_triangle(n):
    for i in range(1, n + 1):
        // [ MISSING LINE HERE ]",
        "option_a": "print('*' * i)",
        "option_b": "print('*' * (n - i))",
        "option_c": "print('*' + str(i))",
        "option_d": "print(i * ' ' + '*')",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_M02",
        "academic_year": 2,
        "language": "c",
        "difficulty": "medium",
        "marks": 3,
        "question": "What pattern does the following nested loop print for n = 3?",
        "code": "#include <stdio.h>
int main() {
    for (int i = 1; i <= 3; i++) {
        for (int j = 1; j <= i; j++) {
            printf(\"%d\", j);
        }
        printf(\"\n\");
    }
    return 0;
}",
        "option_a": "1\n12\n123",
        "option_b": "1\n22\n333",
        "option_c": "123\n12\n1",
        "option_d": "3\n23\n123",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_M03",
        "academic_year": 2,
        "language": "python",
        "difficulty": "medium",
        "marks": 3,
        "question": "Deduce the missing line of logic to generate an inverted centered pyramid of odd stars (*, ***, *****):",
        "code": "def inverted_pyramid(n):
    for i in range(n, 0, -1):
        spaces = ' ' * (n - i)
        // [ MISSING LINE HERE ]
        print(spaces + stars)",
        "option_a": "stars = '*' * (2 * i - 1)",
        "option_b": "stars = '*' * (2 * i)",
        "option_c": "stars = '*' * i",
        "option_d": "stars = '*' * (i * i)",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_M04",
        "academic_year": 2,
        "language": "python",
        "difficulty": "medium",
        "marks": 3,
        "question": "What is the final returned output of fun(5) for this recursive function?",
        "code": "def fun(n):
    if n <= 1:
        return 1
    return n * fun(n - 2)

print(fun(5))",
        "option_a": "15",
        "option_b": "120",
        "option_c": "24",
        "option_d": "5",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_M05",
        "academic_year": 2,
        "language": "c",
        "difficulty": "medium",
        "marks": 3,
        "question": "Complete the two-pointer palindrome check loop by selecting the mismatch condition:",
        "code": "int is_palindrome(const char *s, int len) {
    int l = 0, r = len - 1;
    while (l < r) {
        // [ MISSING LINE HERE ]
            return 0;
        l++;
        r--;
    }
    return 1;
}",
        "option_a": "if (s[l] != s[r])",
        "option_b": "if (s[l] == s[r])",
        "option_c": "if (l == r)",
        "option_d": "if (s[l] == '\0')",
        "correct_answer": "a",
        "is_active": True
    },

    # --- HARD (5 questions, 5 marks each) ---
    {
        "question_id": "L2_Y2_H01",
        "academic_year": 2,
        "language": "python",
        "difficulty": "hard",
        "marks": 5,
        "question": "Supply the missing logic to generate the next row of Pascal's Triangle given current row:",
        "code": "def next_pascals_row(row):
    next_row = [1]
    for i in range(len(row) - 1):
        // [ MISSING LINE HERE ]
    next_row.append(1)
    return next_row",
        "option_a": "next_row.append(row[i] + row[i + 1])",
        "option_b": "next_row.append(row[i] * row[i + 1])",
        "option_c": "next_row.append(row[i] + i)",
        "option_d": "next_row.append(row[i + 1] - row[i])",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_H02",
        "academic_year": 2,
        "language": "python",
        "difficulty": "hard",
        "marks": 5,
        "question": "Predict the exact output of this 2D list modification due to shallow multiplication:",
        "code": "matrix = [[0] * 3] * 3
matrix[0][0] = 7
print(matrix[1][0], matrix[2][0])",
        "option_a": "7 7",
        "option_b": "0 0",
        "option_c": "7 0",
        "option_d": "0 7",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_H03",
        "academic_year": 2,
        "language": "python",
        "difficulty": "hard",
        "marks": 5,
        "question": "Identify the missing binary search condition to find the peak element in an array:",
        "code": "def find_peak(nums):
    low, high = 0, len(nums) - 1
    while low < high:
        mid = (low + high) // 2
        // [ MISSING LINE HERE ]
            high = mid
        else:
            low = mid + 1
    return low",
        "option_a": "if nums[mid] > nums[mid + 1]:",
        "option_b": "if nums[mid] < nums[mid + 1]:",
        "option_c": "if nums[mid] == nums[high]:",
        "option_d": "if nums[mid] > nums[low]:",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_H04",
        "academic_year": 2,
        "language": "c",
        "difficulty": "hard",
        "marks": 5,
        "question": "What is the output of pointer arithmetic combined with bitwise XOR operation in C?",
        "code": "#include <stdio.h>
int main() {
    int arr[] = {10, 20, 30, 40};
    int *p = arr + 1;
    printf(\"%d\", *(p + 2) ^ *p);
    return 0;
}",
        "option_a": "60",
        "option_b": "50",
        "option_c": "20",
        "option_d": "30",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y2_H05",
        "academic_year": 2,
        "language": "python",
        "difficulty": "hard",
        "marks": 5,
        "question": "Complete the logic for printing a hollow square star pattern of size n (only border stars):",
        "code": "def print_hollow_square(n):
    for i in range(n):
        for j in range(n):
            // [ MISSING LINE HERE ]
                print('*', end='')
            else:
                print(' ', end='')
        print()",
        "option_a": "if i == 0 or i == n - 1 or j == 0 or j == n - 1:",
        "option_b": "if i == j or i + j == n - 1:",
        "option_c": "if i == 0 and j == 0:",
        "option_d": "if i % 2 == 0 or j % 2 == 0:",
        "correct_answer": "a",
        "is_active": True
    },

    # ════════════════════ YEAR 3 QUESTIONS (15 total: 5 Easy @ 1m, 5 Med @ 3m, 5 Hard @ 5m) ════════════════════
    # --- EASY (5 questions, 1 mark each) ---
    {
        "question_id": "L2_Y3_E01",
        "academic_year": 3,
        "language": "java",
        "difficulty": "easy",
        "marks": 1,
        "question": "Supply the missing line to update element frequency inside a Java Map:",
        "code": "public void countFrequency(int[] nums, Map<Integer, Integer> freq) {
    for (int n : nums) {
        // [ MISSING LINE HERE ]
    }
}",
        "option_a": "freq.put(n, freq.getOrDefault(n, 0) + 1);",
        "option_b": "freq.put(n, freq.get(n) + 1);",
        "option_c": "freq.add(n, 1);",
        "option_d": "freq.put(n, 0);",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_E02",
        "academic_year": 3,
        "language": "python",
        "difficulty": "easy",
        "marks": 1,
        "question": "Complete the search loop to return the index of the first matching target character:",
        "code": "def first_index(s, target):
    for i, ch in enumerate(s):
        // [ MISSING LINE HERE ]
            return i
    return -1",
        "option_a": "if ch == target:",
        "option_b": "if s[i] != target:",
        "option_c": "if target in ch:",
        "option_d": "if i == target:",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_E03",
        "academic_year": 3,
        "language": "java",
        "difficulty": "easy",
        "marks": 1,
        "question": "What is the output of String concatenation inside this loop in Java?",
        "code": "public class Main {
    public static void main(String[] args) {
        String s = \"A\";
        s.concat(\"B\");
        System.out.println(s);
    }
}",
        "option_a": "A",
        "option_b": "AB",
        "option_c": "B",
        "option_d": "NullPointerException",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_E04",
        "academic_year": 3,
        "language": "python",
        "difficulty": "easy",
        "marks": 1,
        "question": "Predict the output of the following list comprehension with step filtering:",
        "code": "res = [x * 2 for x in range(6) if x % 2 != 0]
print(res)",
        "option_a": "[2, 6, 10]",
        "option_b": "[0, 4, 8]",
        "option_c": "[1, 3, 5]",
        "option_d": "[2, 4, 6, 8, 10]",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_E05",
        "academic_year": 3,
        "language": "java",
        "difficulty": "easy",
        "marks": 1,
        "question": "Identify the standard null and empty check for an incoming string in Java:",
        "code": "public boolean isBlank(String str) {
    // [ MISSING LINE HERE ]
        return true;
    return false;
}",
        "option_a": "if (str == null || str.trim().isEmpty())",
        "option_b": "if (str.length() == 0 || str != null)",
        "option_c": "if (str == \"\")",
        "option_d": "if (str.equals(null))",
        "correct_answer": "a",
        "is_active": True
    },

    # --- MEDIUM (5 questions, 3 marks each) ---
    {
        "question_id": "L2_Y3_M01",
        "academic_year": 3,
        "language": "python",
        "difficulty": "medium",
        "marks": 3,
        "question": "Supply the missing lookup check for one-pass Two Sum using a hash map:",
        "code": "def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        // [ MISSING LINE HERE ]
            return [seen[complement], i]
        seen[num] = i
    return []",
        "option_a": "if complement in seen:",
        "option_b": "if complement not in seen:",
        "option_c": "if target in seen:",
        "option_d": "if num in seen:",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_M02",
        "academic_year": 3,
        "language": "java",
        "difficulty": "medium",
        "marks": 3,
        "question": "Complete the bracket matching algorithm by checking stack state when encountering a closing brace:",
        "code": "public boolean isValid(String s) {
    Stack<Character> stack = new Stack<>();
    for (char c : s.toCharArray()) {
        if (c == '(') stack.push(')');
        else if (c == '{') stack.push('}');
        else if (c == '[') stack.push(']');
        // [ MISSING LINE HERE ]
            return false;
    }
    return stack.isEmpty();
}",
        "option_a": "else if (stack.isEmpty() || stack.pop() != c)",
        "option_b": "else if (stack.peek() == c)",
        "option_c": "else if (!stack.isEmpty())",
        "option_d": "else if (stack.pop() == c)",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_M03",
        "academic_year": 3,
        "language": "python",
        "difficulty": "medium",
        "marks": 3,
        "question": "What pattern does the following Floyd's Triangle code print for rows = 3?",
        "code": "num = 1
for i in range(1, 4):
    for j in range(1, i + 1):
        print(num, end=' ')
        num += 1
    print()",
        "option_a": "1 \n2 3 \n4 5 6",
        "option_b": "1 \n1 2 \n1 2 3",
        "option_c": "1 \n2 2 \n3 3 3",
        "option_d": "1 2 3 \n4 5 \n6",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_M04",
        "academic_year": 3,
        "language": "java",
        "difficulty": "medium",
        "marks": 3,
        "question": "Predict the output of Java Streams map-reduce pipeline:",
        "code": "List<Integer> list = Arrays.asList(1, 2, 3, 4);
int result = list.stream()
                 .filter(n -> n % 2 == 0)
                 .map(n -> n * n)
                 .reduce(0, Integer::sum);
System.out.println(result);",
        "option_a": "20",
        "option_b": "30",
        "option_c": "16",
        "option_d": "10",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_M05",
        "academic_year": 3,
        "language": "python",
        "difficulty": "medium",
        "marks": 3,
        "question": "Deduce the missing logic to print an alternating 0-1 binary triangle pattern:",
        "code": "def binary_pattern(n):
    for i in range(1, n + 1):
        for j in range(1, i + 1):
            // [ MISSING LINE HERE ]
                print('1 ', end='')
            else:
                print('0 ', end='')
        print()",
        "option_a": "if (i + j) % 2 == 0:",
        "option_b": "if i % 2 == 0:",
        "option_c": "if j % 2 == 0:",
        "option_d": "if (i * j) % 2 == 0:",
        "correct_answer": "a",
        "is_active": True
    },

    # --- HARD (5 questions, 5 marks each) ---
    {
        "question_id": "L2_Y3_H01",
        "academic_year": 3,
        "language": "python",
        "difficulty": "hard",
        "marks": 5,
        "question": "Complete the missing boundary increment step in standard Spiral Matrix Traversal:",
        "code": "def spiral_order(matrix):
    res = []
    top, bottom = 0, len(matrix) - 1
    left, right = 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1): res.append(matrix[top][c])
        top += 1
        for r in range(top, bottom + 1): res.append(matrix[r][right])
        right -= 1
        if top <= bottom:
            for c in range(right, left - 1, -1): res.append(matrix[bottom][c])
            // [ MISSING LINE HERE ]
        if left <= right:
            for r in range(bottom, top - 1, -1): res.append(matrix[r][left])
            left += 1
    return res",
        "option_a": "bottom -= 1",
        "option_b": "bottom += 1",
        "option_c": "top += 1",
        "option_d": "left -= 1",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_H02",
        "academic_year": 3,
        "language": "java",
        "difficulty": "hard",
        "marks": 5,
        "question": "What will be printed when checking string reference equality vs value equality in Java?",
        "code": "public class Main {
    public static void main(String[] args) {
        String a = \"CodeFest\";
        String b = new String(\"CodeFest\");
        String c = b.intern();
        System.out.println((a == b) + \" \" + (a == c));
    }
}",
        "option_a": "false true",
        "option_b": "true true",
        "option_c": "false false",
        "option_d": "true false",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_H03",
        "academic_year": 3,
        "language": "python",
        "difficulty": "hard",
        "marks": 5,
        "question": "Deduce the missing transition equation for the bottom-up Coin Change minimum coins problem:",
        "code": "def coin_change(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for coin in coins:
        for x in range(coin, amount + 1):
            // [ MISSING LINE HERE ]
    return dp[amount] if dp[amount] != float('inf') else -1",
        "option_a": "dp[x] = min(dp[x], dp[x - coin] + 1)",
        "option_b": "dp[x] = dp[x - coin] + 1",
        "option_c": "dp[x] = min(dp[x], dp[coin] + 1)",
        "option_d": "dp[x] = dp[x] + dp[x - coin]",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_H04",
        "academic_year": 3,
        "language": "python",
        "difficulty": "hard",
        "marks": 5,
        "question": "What is the output of this bitwise power-set generator length for n = 3?",
        "code": "def count_subsets(arr):
    n = len(arr)
    subsets = []
    for i in range(1 << n):
        subsets.append([arr[j] for j in range(n) if (i & (1 << j))])
    return len(subsets)

print(count_subsets([10, 20, 30]))",
        "option_a": "8",
        "option_b": "6",
        "option_c": "7",
        "option_d": "9",
        "correct_answer": "a",
        "is_active": True
    },
    {
        "question_id": "L2_Y3_H05",
        "academic_year": 3,
        "language": "java",
        "difficulty": "hard",
        "marks": 5,
        "question": "Identify the missing logic to maintain sliding window maximum using an ArrayDeque:",
        "code": "public int[] maxSlidingWindow(int[] nums, int k) {
    Deque<Integer> q = new ArrayDeque<>();
    int[] res = new int[nums.length - k + 1];
    for (int i = 0; i < nums.length; i++) {
        while (!q.isEmpty() && q.peekFirst() < i - k + 1) q.pollFirst();
        // [ MISSING LINE HERE ]
            q.pollLast();
        q.offerLast(i);
        if (i >= k - 1) res[i - k + 1] = nums[q.peekFirst()];
    }
    return res;
}",
        "option_a": "while (!q.isEmpty() && nums[q.peekLast()] < nums[i])",
        "option_b": "while (!q.isEmpty() && nums[q.peekFirst()] < nums[i])",
        "option_c": "if (q.peekLast() != null && nums[q.peekLast()] > nums[i])",
        "option_d": "while (!q.isEmpty() && nums[q.peekLast()] == nums[i])",
        "correct_answer": "a",
        "is_active": True
    }
]

    # Ensure standard quotas (5 easy, 5 medium, 5 hard) (3 easy, 3 medium, 2 hard) are configured
    for qk, qv in [("l2_quota_easy", "5"), ("l2_quota_medium", "5"), ("l2_quota_hard", "5")]:
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
        "message": f"Successfully seeded {len(demo_questions)} demo questions (15 for Year 2, 15 for Year 3). Pool quotas (5 Easy, 5 Medium, 5 Hard = 15 total) are 100% satisfied!",
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
