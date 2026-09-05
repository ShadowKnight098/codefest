from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from datetime import datetime

class LoginRequest(BaseModel):
    roll_number: str = Field(..., description="Student Roll Number (e.g. 23AIML042)")
    email: EmailStr = Field(..., description="Registered institutional email")
    pin: str = Field(..., min_length=4, max_length=8, description="Access PIN provided for the fest")

class ParticipantResponse(BaseModel):
    id: str
    roll_number: str
    name: str
    email: str
    academic_year: int
    is_enabled: bool

    model_config = ConfigDict(from_attributes=True)

class SessionStatusResponse(BaseModel):
    authenticated: bool
    participant: Optional[ParticipantResponse] = None
    message: Optional[str] = None
