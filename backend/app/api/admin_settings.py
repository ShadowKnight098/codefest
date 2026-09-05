from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import CompetitionSetting
from app.schemas.admin import SettingUpdate, SettingResponse
from app.api.deps import require_superadmin

router = APIRouter(prefix="/admin/settings", tags=["Admin Settings"])

@router.get("", response_model=List[SettingResponse])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    result = await db.execute(select(CompetitionSetting).order_by(CompetitionSetting.key.asc()))
    return result.scalars().all()

@router.put("/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    payload: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_superadmin)
):
    result = await db.execute(select(CompetitionSetting).where(CompetitionSetting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        # Create if not found
        setting = CompetitionSetting(key=key, value=payload.value.strip())
        db.add(setting)
    else:
        setting.value = payload.value.strip()

    await db.commit()
    await db.refresh(setting)
    return setting
