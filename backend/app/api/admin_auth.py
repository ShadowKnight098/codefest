from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import AdminUser
from app.core.config import settings
from app.core.security import verify_pin, create_admin_session_token
from app.schemas.admin import AdminLoginRequest, AdminResponse
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin/auth", tags=["Admin Auth"])

@router.post("/login", response_model=AdminResponse)
async def admin_login(
    payload: AdminLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    username_clean = payload.username.strip()
    result = await db.execute(
        select(AdminUser).where(AdminUser.username == username_clean)
    )
    admin = result.scalar_one_or_none()

    if not admin or not verify_pin(payload.password, admin.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin username or password."
        )

    token = create_admin_session_token(admin.id, admin.username, admin.role)
    is_secure = settings.ENVIRONMENT != "development"
    samesite_val = "none" if is_secure else "lax"

    response.set_cookie(
        key=settings.ADMIN_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_EXPIRE_HOURS * 3600,
        httponly=True,
        secure=is_secure,
        samesite=samesite_val,
        path="/"
    )
    return admin

@router.post("/logout")
async def admin_logout(response: Response):
    is_secure = settings.ENVIRONMENT != "development"
    samesite_val = "none" if is_secure else "lax"
    response.delete_cookie(
        key=settings.ADMIN_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=is_secure,
        samesite=samesite_val
    )
    return {"message": "Admin logged out successfully."}

@router.get("/me", response_model=AdminResponse)
async def admin_me(current_admin: AdminUser = Depends(get_current_admin)):
    return current_admin
