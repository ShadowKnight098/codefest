from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Competition, Round
from app.schemas.admin import (
    CompetitionCreate, CompetitionUpdate, CompetitionResponse,
    RoundCreate, RoundUpdate, RoundResponse
)
from app.api.deps import get_current_admin
from app.core.cache import memory_cache

router = APIRouter(prefix="/admin", tags=["Admin Competitions & Rounds"])

# ─── Competitions ───

@router.get("/competitions", response_model=List[CompetitionResponse])
async def list_competitions(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(Competition).order_by(Competition.created_at.desc()))
    return result.scalars().all()

@router.post("/competitions", response_model=CompetitionResponse)
async def create_competition(
    payload: CompetitionCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    comp = Competition(name=payload.name.strip(), description=payload.description)
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    return comp

@router.put("/competitions/{comp_id}", response_model=CompetitionResponse)
async def update_competition(
    comp_id: str,
    payload: CompetitionUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(Competition).where(Competition.id == comp_id))
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found.")

    if payload.name is not None:
        comp.name = payload.name.strip()
    if payload.description is not None:
        comp.description = payload.description
    if payload.is_active is not None:
        comp.is_active = payload.is_active

    await db.commit()
    await db.refresh(comp)
    return comp

# ─── Rounds ───

@router.get("/competitions/{comp_id}/rounds", response_model=List[RoundResponse])
async def list_rounds(
    comp_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(
        select(Round).where(Round.competition_id == comp_id).order_by(Round.round_number.asc())
    )
    return result.scalars().all()

@router.post("/competitions/{comp_id}/rounds", response_model=RoundResponse)
async def create_round(
    comp_id: str,
    payload: RoundCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    comp_res = await db.execute(select(Competition).where(Competition.id == comp_id))
    if not comp_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Competition not found.")

    r = Round(
        competition_id=comp_id,
        round_number=payload.round_number,
        name=payload.name.strip(),
        is_open=payload.is_open,
        duration_minutes=payload.duration_minutes
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    memory_cache.delete("all_rounds_dict")
    return r

@router.put("/rounds/{round_id}", response_model=RoundResponse)
async def update_round(
    round_id: str,
    payload: RoundUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    """
    Update round properties, including dynamic open/close toggle.
    """
    result = await db.execute(select(Round).where(Round.id == round_id))
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Round not found.")

    if payload.name is not None:
        r.name = payload.name.strip()
    if payload.is_open is not None:
        r.is_open = payload.is_open
    if payload.duration_minutes is not None:
        r.duration_minutes = payload.duration_minutes

    await db.commit()
    await db.refresh(r)
    memory_cache.delete("all_rounds_dict")
    return r
