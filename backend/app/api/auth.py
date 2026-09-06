from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Participant
from app.core.config import settings
from app.core.security import (
    verify_pin, create_session_token,
    check_login_rate_limit, record_login_failure, record_login_success
)
from app.schemas.auth import LoginRequest, ParticipantResponse, SessionStatusResponse
from app.api.deps import get_current_participant

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=ParticipantResponse)
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate participant with Roll Number + Registered Email + Access PIN.
    Server-authoritative rate limiting and session cookie setting.
    """
    client_ip = request.client.host if request.client else "unknown"
    roll_clean = payload.roll_number.strip().upper()
    email_clean = payload.email.strip().lower()

    # 1. Check Rate Limit / Lockout on Roll Number
    allowed, err_msg = check_login_rate_limit(roll_clean)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=err_msg
        )

    # 2. Check Rate Limit / Lockout on IP
    allowed_ip, err_msg_ip = check_login_rate_limit(client_ip)
    if not allowed_ip:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=err_msg_ip
        )

    # 3. Lookup Participant
    result = await db.execute(
        select(Participant).where(
            Participant.roll_number == roll_clean,
            Participant.email == email_clean
        )
    )
    participant = result.scalar_one_or_none()

    if not participant:
        fails = record_login_failure(roll_clean)
        record_login_failure(client_ip)
        remaining_attempts = max(0, settings.MAX_LOGIN_ATTEMPTS - fails)
        detail = "Invalid credentials. Roll Number and Email combination not found."
        if remaining_attempts > 0:
            detail += f" ({remaining_attempts} attempt(s) remaining before temporary lockout)."
        else:
            detail = f"Too many failed attempts. Account temporarily locked for {settings.LOCKOUT_DURATION_MINUTES} minutes."
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail
        )

    # 4. Check if account is enabled
    if not participant.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been disabled by the competition administrator."
        )

    # 5. Verify Password / PIN (allows roll number or hashed PIN)
    pin_clean = payload.pin.strip()
    is_valid_pin = (
        verify_pin(pin_clean, participant.hashed_pin) or
        verify_pin(pin_clean.upper(), participant.hashed_pin) or
        (pin_clean.upper() == roll_clean)
    )
    if not is_valid_pin:
        fails = record_login_failure(roll_clean)
        record_login_failure(client_ip)
        remaining_attempts = max(0, settings.MAX_LOGIN_ATTEMPTS - fails)
        detail = "Invalid Password. Please enter your Roll Number as password."
        if remaining_attempts > 0:
            detail += f" ({remaining_attempts} attempt(s) remaining before temporary lockout)."
        else:
            detail = f"Too many failed attempts. Account temporarily locked for {settings.LOCKOUT_DURATION_MINUTES} minutes."

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail
        )

    # 6. Success: Clear failure attempts and issue HTTP-only cookie
    record_login_success(roll_clean)
    record_login_success(client_ip)

    session_token = create_session_token(participant.id, participant.roll_number)

    # Cookie security attributes: SameSite=None + Secure for cross-origin (Vercel -> Render), Lax for local dev
    is_secure = (
        settings.ENVIRONMENT != "development" or
        request.headers.get("x-forwarded-proto") == "https" or
        request.url.scheme == "https"
    )
    samesite_val = "none" if is_secure else "lax"
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=session_token,
        max_age=settings.SESSION_EXPIRE_HOURS * 3600,
        httponly=True,
        secure=is_secure,
        samesite=samesite_val,
        path="/"
    )

    return ParticipantResponse(
        id=participant.id,
        roll_number=participant.roll_number,
        name=participant.name,
        email=participant.email,
        academic_year=participant.academic_year,
        is_enabled=participant.is_enabled,
        token=session_token
    )

@router.post("/logout")
async def logout(request: Request, response: Response):
    """
    Invalidate participant session by deleting cookie.
    """
    is_secure = (
        settings.ENVIRONMENT != "development" or
        request.headers.get("x-forwarded-proto") == "https" or
        request.url.scheme == "https"
    )
    samesite_val = "none" if is_secure else "lax"
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=is_secure,
        samesite=samesite_val
    )
    return {"message": "Successfully logged out."}

@router.get("/me", response_model=ParticipantResponse)
async def get_me(
    current_participant: Participant = Depends(get_current_participant)
):
    """
    Return currently authenticated participant details.
    """
    return current_participant
