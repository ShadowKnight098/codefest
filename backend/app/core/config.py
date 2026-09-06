from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
import os
import json

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI/ML Department Technical Competition Platform"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production-fest-2026-secure-hash"
    
    # Session config
    SESSION_COOKIE_NAME: str = "fest_session_token"
    ADMIN_COOKIE_NAME: str = "fest_admin_token"
    SESSION_EXPIRE_HOURS: int = 12

    # Database: Supabase PostgreSQL via Transaction Pooler
    DATABASE_URL: str = "sqlite+aiosqlite:///./competition.db"
    
    # Redis (optional — for production rate limiting & job queue)
    REDIS_URL: str = "redis://localhost:6379/0"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://codefest2.vercel.app",
        "https://codefest2.vercel.app/",
    ]

    # Rate limiting & Lockout
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15

    # Qualifying Threshold (default fallback, overridden by competition_settings in DB)
    MCQ_QUALIFYING_SCORE: int = 18

    # Judge0 — Distributed Code Execution (4 laptops on college WiFi LAN)
    JUDGE0_ENDPOINTS: str = '["http://192.168.1.101:2358"]'
    JUDGE0_AUTH_TOKEN: str = ""
    
    # Judge0 Language ID Mapping (Judge0 CE)
    JUDGE0_LANG_MAP: str = '{"python": 71, "c": 50, "cpp": 54, "java": 62}'

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def is_postgres(self) -> bool:
        """Check if we're using PostgreSQL (Supabase) vs SQLite."""
        return "postgresql" in self.DATABASE_URL

    @property
    def judge0_endpoint_list(self) -> List[str]:
        """Parse Judge0 endpoints from JSON string."""
        try:
            return json.loads(self.JUDGE0_ENDPOINTS)
        except (json.JSONDecodeError, TypeError):
            return []

    @property
    def judge0_language_map(self) -> dict:
        """Parse Judge0 language ID mapping."""
        try:
            return json.loads(self.JUDGE0_LANG_MAP)
        except (json.JSONDecodeError, TypeError):
            return {"python": 71, "c": 50, "cpp": 54, "java": 62}

settings = Settings()
