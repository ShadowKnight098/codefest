import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, ForeignKey, 
    Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.db.session import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class Participant(Base):
    __tablename__ = "participants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    roll_number = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    academic_year = Column(Integer, nullable=False) # 1, 2, 3, 4
    hashed_pin = Column(String(255), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    mcq_attempts = relationship("MCQAttempt", back_populates="participant", cascade="all, delete-orphan")
    coding_attempts = relationship("CodingAttempt", back_populates="participant", cascade="all, delete-orphan")
    round_results = relationship("RoundResult", back_populates="participant", cascade="all, delete-orphan")
    security_events = relationship("SecurityEvent", back_populates="participant", cascade="all, delete-orphan")

class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="ADMIN", nullable=False) # SUPERADMIN, ADMIN, PROCTOR
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class Competition(Base):
    __tablename__ = "competitions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    rounds = relationship("Round", back_populates="competition", cascade="all, delete-orphan")

class Round(Base):
    __tablename__ = "rounds"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    competition_id = Column(String(36), ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    round_number = Column(Integer, nullable=False) # 1 = MCQ, 2 = Coding
    name = Column(String(255), nullable=False)
    is_open = Column(Boolean, default=False, nullable=False)
    duration_minutes = Column(Integer, default=30, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    competition = relationship("Competition", back_populates="rounds")
    mcq_attempts = relationship("MCQAttempt", back_populates="round", cascade="all, delete-orphan")
    coding_attempts = relationship("CodingAttempt", back_populates="round", cascade="all, delete-orphan")
    round_results = relationship("RoundResult", back_populates="round", cascade="all, delete-orphan")

class CompetitionSetting(Base):
    __tablename__ = "competition_settings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(String(255), nullable=False)

class MCQQuestion(Base):
    __tablename__ = "mcq_questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    academic_year = Column(Integer, nullable=False, index=True) # 1, 2, 3, 4
    topic = Column(String(100), nullable=False)
    difficulty = Column(String(50), default="MEDIUM", nullable=False) # EASY, MEDIUM, HARD
    question_text = Column(Text, nullable=False)
    option_a = Column(Text, nullable=False)
    option_b = Column(Text, nullable=False)
    option_c = Column(Text, nullable=False)
    option_d = Column(Text, nullable=False)
    correct_option = Column(String(1), nullable=False) # 'A', 'B', 'C', 'D' (never sent to client)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class MCQAttempt(Base):
    __tablename__ = "mcq_attempts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    participant_id = Column(String(36), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(String(36), ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    duration_seconds = Column(Integer, default=1800, nullable=False) # 30 mins default
    status = Column(String(50), default="IN_PROGRESS", nullable=False) # NOT_STARTED, IN_PROGRESS, SUBMITTED, TERMINATED
    submitted_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("participant_id", "round_id", name="uq_mcq_attempt_participant_round"),
        Index("idx_mcq_attempt_participant", "participant_id"),
    )

    participant = relationship("Participant", back_populates="mcq_attempts")
    round = relationship("Round", back_populates="mcq_attempts")
    attempt_questions = relationship("MCQAttemptQuestion", back_populates="attempt", cascade="all, delete-orphan")
    answers = relationship("MCQAnswer", back_populates="attempt", cascade="all, delete-orphan")

class MCQAttemptQuestion(Base):
    __tablename__ = "mcq_attempt_questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    attempt_id = Column(String(36), ForeignKey("mcq_attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(36), ForeignKey("mcq_questions.id", ondelete="CASCADE"), nullable=False)
    display_order = Column(Integer, nullable=False) # 1 to 25

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_attempt_question"),
        Index("idx_attempt_display_order", "attempt_id", "display_order"),
    )

    attempt = relationship("MCQAttempt", back_populates="attempt_questions")
    question = relationship("MCQQuestion")

class MCQAnswer(Base):
    __tablename__ = "mcq_answers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    attempt_id = Column(String(36), ForeignKey("mcq_attempts.id", ondelete="CASCADE"), nullable=False)
    question_id = Column(String(36), ForeignKey("mcq_questions.id", ondelete="CASCADE"), nullable=False)
    selected_option = Column(String(1), nullable=True) # 'A', 'B', 'C', 'D' or None
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_mcq_answer_attempt_question"),
        Index("idx_mcq_answers_attempt", "attempt_id"),
    )

    attempt = relationship("MCQAttempt", back_populates="answers")
    question = relationship("MCQQuestion")

class CodingProblem(Base):
    __tablename__ = "coding_problems"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    round_id = Column(String(36), ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    constraints = Column(Text, nullable=True)
    time_limit_ms = Column(Integer, default=2000, nullable=False)
    memory_limit_mb = Column(Integer, default=256, nullable=False)
    marks = Column(Integer, default=15, nullable=False) # 15 for EASY, 30 for HARD
    difficulty = Column(String(20), default="EASY", nullable=False) # "EASY" or "HARD"
    order_num = Column(Integer, default=1, nullable=False)
    starter_code = Column(Text, nullable=True) # JSON string of per-language starter code or plain string

    test_cases = relationship("CodingTestCase", back_populates="problem", cascade="all, delete-orphan")

class CodingTestCase(Base):
    __tablename__ = "coding_test_cases"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    problem_id = Column(String(36), ForeignKey("coding_problems.id", ondelete="CASCADE"), nullable=False)
    input_data = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=False)
    is_hidden = Column(Boolean, default=False, nullable=False) # Never sent to participant client
    order_num = Column(Integer, default=1, nullable=False)

    problem = relationship("CodingProblem", back_populates="test_cases")

class CodingAttempt(Base):
    __tablename__ = "coding_attempts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    participant_id = Column(String(36), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(String(36), ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    duration_seconds = Column(Integer, default=3600, nullable=False) # 60 mins default
    status = Column(String(50), default="IN_PROGRESS", nullable=False) # NOT_STARTED, IN_PROGRESS, SUBMITTED, TERMINATED
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    assigned_problem_ids = Column(Text, nullable=True) # JSON array of exactly 2 problem IDs: [easy_id, hard_id]

    __table_args__ = (
        UniqueConstraint("participant_id", "round_id", name="uq_coding_attempt_participant_round"),
        Index("idx_coding_attempt_participant", "participant_id"),
    )

    participant = relationship("Participant", back_populates="coding_attempts")
    round = relationship("Round", back_populates="coding_attempts")
    submissions = relationship("CodingSubmission", back_populates="attempt", cascade="all, delete-orphan")

class CodingSubmission(Base):
    __tablename__ = "coding_submissions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    attempt_id = Column(String(36), ForeignKey("coding_attempts.id", ondelete="CASCADE"), nullable=False)
    problem_id = Column(String(36), ForeignKey("coding_problems.id", ondelete="CASCADE"), nullable=False)
    language = Column(String(50), nullable=False) # python, c, cpp, java
    code = Column(Text, nullable=False)
    status = Column(String(50), default="QUEUED", nullable=False) # QUEUED, RUNNING, COMPLETED, FAILED
    test_cases_passed = Column(Integer, default=0, nullable=False)
    total_test_cases = Column(Integer, default=4, nullable=False)
    score = Column(Integer, default=0, nullable=False) # 0, 5, 10, 15, 20
    execution_time_ms = Column(Integer, nullable=True)
    failure_reason = Column(String(100), nullable=True) # COMPILE_ERROR, RUNTIME_ERROR, TIMEOUT, MEMORY_LIMIT_EXCEEDED, WRONG_OUTPUT, CRASHED
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        Index("idx_coding_submissions_attempt", "attempt_id"),
    )

    attempt = relationship("CodingAttempt", back_populates="submissions")
    problem = relationship("CodingProblem")

class RoundResult(Base):
    __tablename__ = "round_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    participant_id = Column(String(36), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(String(36), ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, nullable=False)
    is_qualified = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("participant_id", "round_id", name="uq_round_results_participant_round"),
        Index("idx_round_results_participant", "participant_id"),
    )

    participant = relationship("Participant", back_populates="round_results")
    round = relationship("Round", back_populates="round_results")

class SecurityEvent(Base):
    __tablename__ = "security_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    participant_id = Column(String(36), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    attempt_type = Column(String(20), nullable=False)  # "MCQ" or "CODING"
    attempt_id = Column(String(36), nullable=False)  # References mcq_attempts.id or coding_attempts.id
    event_type = Column(String(50), default="TAB_HIDDEN", nullable=False)
    violation_count = Column(Integer, default=1, nullable=False)  # Running count at time of event
    idempotency_key = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("attempt_id", "idempotency_key", name="uq_security_event_idempotent"),
        Index("idx_security_events_attempt", "attempt_id"),
        Index("idx_security_events_participant", "participant_id"),
    )

    participant = relationship("Participant")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    admin_id = Column(String(36), nullable=True)
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class PresentationEvaluation(Base):
    __tablename__ = "presentation_evaluations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    participant_id = Column(String(36), ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, unique=True)
    round_id = Column(String(36), ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    evaluator_id = Column(String(36), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True)
    evaluator_name = Column(String(100), nullable=True)

    presentation_score = Column(Integer, default=0, nullable=False) # e.g. /15
    technical_score = Column(Integer, default=0, nullable=False)    # e.g. /20
    viva_score = Column(Integer, default=0, nullable=False)         # e.g. /15
    total_score = Column(Integer, default=0, nullable=False)        # /50

    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    participant = relationship("Participant")
    round = relationship("Round")
    evaluator = relationship("AdminUser")


class Judge0Node(Base):
    __tablename__ = "judge0_nodes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=True) # e.g. "Node 1 (Lab Laptop)", "Server 2"
    endpoint_url = Column(String(255), unique=True, nullable=False, index=True) # e.g. "http://192.168.1.105:2358"
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


