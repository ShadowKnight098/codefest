from pydantic import BaseModel
from typing import Optional
from enum import Enum

class ParticipantState(str, Enum):
    LEVEL1_AVAILABLE = "LEVEL1_AVAILABLE"
    LEVEL1_IN_PROGRESS = "LEVEL1_IN_PROGRESS"
    LEVEL1_COMPLETED = "LEVEL1_COMPLETED"
    QUALIFIED = "QUALIFIED"
    NOT_QUALIFIED = "NOT_QUALIFIED"
    WAITING_FOR_LEVEL2 = "WAITING_FOR_LEVEL2"
    LEVEL2_AVAILABLE = "LEVEL2_AVAILABLE"
    LEVEL2_IN_PROGRESS = "LEVEL2_IN_PROGRESS"
    COMPLETED = "COMPLETED"
    TERMINATED = "TERMINATED"

class RoundInfo(BaseModel):
    round_id: str
    round_number: int
    name: str
    is_open: bool
    duration_minutes: int

class ResultSummary(BaseModel):
    round_number: int
    score: int
    total_marks: int
    is_qualified: bool
    status_label: str

class DashboardStateResponse(BaseModel):
    participant_name: str
    roll_number: str
    academic_year: int
    email: str
    state: ParticipantState
    state_headline: str
    state_description: str
    can_start_level1: bool
    can_resume_level1: bool
    can_start_level2: bool
    can_resume_level2: bool
    current_level1_attempt_id: Optional[str] = None
    current_level2_attempt_id: Optional[str] = None
    level1_round: Optional[RoundInfo] = None
    level2_round: Optional[RoundInfo] = None
    level1_result: Optional[ResultSummary] = None
    level2_result: Optional[ResultSummary] = None
    violations_count: int = 0
class ParticipantMarksResponse(BaseModel):
    participant_name: str
    roll_number: str
    academic_year: int
    email: str
    mcq_score: Optional[int] = None
    mcq_max_marks: int = 25
    mcq_status: str
    coding_score: Optional[int] = None
    coding_max_marks: int = 45
    coding_status: str
    total_score: int = 0
    max_total_marks: int = 70
    rank: Optional[int] = None
    total_participants: int = 0
class FeedbackCreateRequest(BaseModel):
    rating: int = 5
    feedback_text: str

class FeedbackResponse(BaseModel):
    id: str
    participant_id: str
    rating: int
    feedback_text: str
    created_at: str



