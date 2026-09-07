from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Participant
from app.core.config import settings
from app.core.security import decode_session_token
from app.core.cache import memory_cache

async def get_current_participant(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Participant:
    """
    Extract session cookie, decode JWT, and fetch participant from DB.
    Server-authoritative check on every protected endpoint.
    """
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        # Also check Authorization: Bearer <token> for development/testing flexibility
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. No active session found."
        )

    payload = decode_session_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid. Please log in again."
        )

    participant_id = payload["sub"]
    cached_p = memory_cache.get(f"part:{participant_id}")
    if cached_p is not None:
        if not cached_p.is_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account has been disabled by the competition administrator."
            )
        return cached_p

    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()

    if not participant:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Participant record not found."
        )

    if not participant.is_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been disabled by the competition administrator."
        )

    memory_cache.set(f"part:{participant_id}", participant, ttl_seconds=15.0)
    return participant


async def get_current_admin(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Extract admin session cookie or Authorization header, decode JWT, verify admin record.
    """
    from app.db.models import AdminUser

    token = request.cookies.get(settings.ADMIN_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required."
        )

    payload = decode_session_token(token)
    if not payload or "sub" not in payload or payload.get("type") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin session invalid or expired."
        )

    admin_id = payload["sub"]
    cached_admin = memory_cache.get(f"admin:{admin_id}")
    if cached_admin is not None:
        return cached_admin

    result = await db.execute(select(AdminUser).where(AdminUser.id == admin_id))
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin user not found."
        )

    memory_cache.set(f"admin:{admin_id}", admin, ttl_seconds=20.0)
    return admin


async def require_superadmin(
    current_admin = Depends(get_current_admin)
):
    if current_admin.role != "SUPERADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin privilege required."
        )
    return current_admin
