"""Admin authentication and management schemas."""
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from datetime import datetime


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=100, description="Admin username")
    password: str = Field(..., min_length=4, max_length=128, description="Admin password")


class AdminResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str  # SUPERADMIN, ADMIN, PROCTOR
    token: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AdminCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(default="PROCTOR", pattern=r"^(SUPERADMIN|ADMIN|PROCTOR)$")


# ─── Competition & Round Schemas ───

class CompetitionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class CompetitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class CompetitionResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoundCreate(BaseModel):
    round_number: int = Field(..., ge=1, le=10)
    name: str = Field(..., min_length=1, max_length=255)
    is_open: bool = False
    duration_minutes: int = Field(default=30, ge=5, le=300)


class RoundUpdate(BaseModel):
    name: Optional[str] = None
    is_open: Optional[bool] = None
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=300)


class RoundResponse(BaseModel):
    id: str
    competition_id: str
    round_number: int
    name: str
    is_open: bool
    duration_minutes: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Participant Management Schemas ───

class ParticipantCreate(BaseModel):
    roll_number: str = Field(..., min_length=1, max_length=50)
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    academic_year: int = Field(..., ge=1, le=4)
    pin: Optional[str] = Field(default=None, min_length=4, max_length=8,
                                description="If not provided, auto-generated")


class ParticipantUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    academic_year: Optional[int] = Field(default=None, ge=1, le=4)
    is_enabled: Optional[bool] = None


class ParticipantAdminResponse(BaseModel):
    id: str
    roll_number: str
    email: str
    name: str
    academic_year: int
    is_enabled: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportValidationRow(BaseModel):
    row_number: int
    roll_number: str
    email: str
    name: str
    academic_year: int
    status: str  # "valid", "error"
    error: Optional[str] = None


class ImportResult(BaseModel):
    total_rows: int
    imported: int
    skipped: int
    errors: list[ImportValidationRow]


class BulkTextImportRequest(BaseModel):
    raw_text: str = Field(..., min_length=1, description="Raw CSV or TSV lines: roll_number, name, email, academic_year")


class PinResetResponse(BaseModel):
    roll_number: str
    new_pin: str


# ─── MCQ Question Schemas ───

class MCQQuestionCreate(BaseModel):
    academic_year: int = Field(..., ge=1, le=4)
    topic: str = Field(..., min_length=1, max_length=100)
    difficulty: str = Field(default="MEDIUM", pattern=r"^(EASY|MEDIUM|HARD)$")
    question_text: str = Field(..., min_length=1)
    option_a: str = Field(..., min_length=1)
    option_b: str = Field(..., min_length=1)
    option_c: str = Field(..., min_length=1)
    option_d: str = Field(..., min_length=1)
    correct_option: str = Field(..., pattern=r"^[A-D]$")


class MCQQuestionUpdate(BaseModel):
    topic: Optional[str] = None
    difficulty: Optional[str] = Field(default=None, pattern=r"^(EASY|MEDIUM|HARD)$")
    question_text: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_option: Optional[str] = Field(default=None, pattern=r"^[A-D]$")
    is_active: Optional[bool] = None


class MCQQuestionResponse(BaseModel):
    id: str
    academic_year: int
    topic: str
    difficulty: str
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ─── Coding Problem Schemas ───

class CodingTestCaseCreate(BaseModel):
    input_data: str
    expected_output: str
    is_hidden: bool = False
    order_num: int = Field(default=1, ge=1)


class CodingTestCaseUpdate(BaseModel):
    input_data: Optional[str] = None
    expected_output: Optional[str] = None
    is_hidden: Optional[bool] = None
    order_num: Optional[int] = None


class CodingTestCaseResponse(BaseModel):
    id: str
    problem_id: str
    input_data: str
    expected_output: str
    is_hidden: bool
    order_num: int

    model_config = ConfigDict(from_attributes=True)


class CodingProblemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    constraints: Optional[str] = None
    time_limit_ms: int = Field(default=2000, ge=100, le=30000)
    memory_limit_mb: int = Field(default=256, ge=16, le=1024)
    marks: int = Field(default=20, ge=1, le=100)
    order_num: int = Field(default=1, ge=1)
    test_cases: list[CodingTestCaseCreate] = []


class CodingProblemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    constraints: Optional[str] = None
    time_limit_ms: Optional[int] = None
    memory_limit_mb: Optional[int] = None
    marks: Optional[int] = None
    order_num: Optional[int] = None


class CodingProblemResponse(BaseModel):
    id: str
    round_id: str
    title: str
    description: str
    constraints: Optional[str]
    time_limit_ms: int
    memory_limit_mb: int
    marks: int
    order_num: int
    test_cases: list[CodingTestCaseResponse] = []

    model_config = ConfigDict(from_attributes=True)


# ─── Settings Schema ───

class SettingUpdate(BaseModel):
    value: str = Field(..., min_length=1, max_length=255)


class SettingResponse(BaseModel):
    id: str
    key: str
    value: str

    model_config = ConfigDict(from_attributes=True)


# ─── Monitor / Live Stats Schemas ───

class LiveStats(BaseModel):
    total_participants: int
    enabled_participants: int
    active_mcq_attempts: int
    submitted_mcq_attempts: int
    active_coding_attempts: int
    submitted_coding_attempts: int
    terminated_count: int
    total_violations: int
    qualified_count: int
    not_qualified_count: int


class LeaderboardEntry(BaseModel):
    rank: int
    participant_id: str
    roll_number: str
    name: str
    academic_year: int
    mcq_score: Optional[int] = None
    mcq_qualified: Optional[bool] = None
    coding_score: Optional[int] = None
    total_score: int
    violations: int
