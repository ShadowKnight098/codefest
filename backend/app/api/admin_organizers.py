import bcrypt
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel, EmailStr, Field

from app.db.session import get_db
from app.db.models import AdminUser
from app.api.deps import require_superadmin
from app.schemas.admin import AdminResponse

router = APIRouter(prefix="/admin/organizers", tags=["Admin Organizers Management"])

class OrganizerCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=4, max_length=64)
    role: str = Field(default="ORGANIZER", pattern=r"^(ORGANIZER|PROCTOR)$")

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8')[:72], salt).decode('utf-8')

@router.get("", response_model=List[AdminResponse])
async def list_organizers(
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(require_superadmin)
):
    """
    List all admin users and organizers. Only accessible by SUPERADMIN (Ma'am/Head).
    """
    result = await db.execute(select(AdminUser).order_by(AdminUser.created_at.asc()))
    return result.scalars().all()

@router.post("", response_model=AdminResponse)
async def create_organizer(
    payload: OrganizerCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(require_superadmin)
):
    """
    Create a new Organizer/Proctor account with restricted Leaderboard-only access.
    Only accessible by SUPERADMIN.
    """
    clean_username = payload.username.strip().lower()
    clean_email = payload.email.strip().lower()

    # Check for duplicate username or email
    existing = await db.execute(
        select(AdminUser).where(
            (AdminUser.username == clean_username) | (AdminUser.email == clean_email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An organizer or admin with this username or email already exists."
        )

    hashed_pw = hash_password(payload.password)
    organizer = AdminUser(
        id=str(uuid.uuid4()),
        username=clean_username,
        email=clean_email,
        hashed_password=hashed_pw,
        role=payload.role
    )
    db.add(organizer)
    await db.commit()
    await db.refresh(organizer)
    return organizer

@router.delete("/{organizer_id}")
async def delete_organizer(
    organizer_id: str,
    db: AsyncSession = Depends(get_db),
    current_admin: AdminUser = Depends(require_superadmin)
):
    """
    Revoke/delete an Organizer account. Cannot delete self or the primary superadmin.
    Only accessible by SUPERADMIN.
    """
    if organizer_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account."
        )

    result = await db.execute(select(AdminUser).where(AdminUser.id == organizer_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Organizer not found.")

    if target.role == "SUPERADMIN" and current_admin.username != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete another SUPERADMIN account."
        )

    await db.delete(target)
    await db.commit()
    return {"message": f"Organizer {target.username} revoked successfully."}
