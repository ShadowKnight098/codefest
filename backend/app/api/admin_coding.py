from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.db.models import CodingProblem, CodingTestCase, Round
from app.schemas.admin import (
    CodingProblemCreate, CodingProblemUpdate, CodingProblemResponse,
    CodingTestCaseCreate, CodingTestCaseUpdate, CodingTestCaseResponse
)
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin/coding-problems", tags=["Admin Coding Problems"])

@router.get("", response_model=List[CodingProblemResponse])
async def list_coding_problems(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(
        select(CodingProblem)
        .options(selectinload(CodingProblem.test_cases))
        .order_by(CodingProblem.order_num.asc())
    )
    return result.scalars().all()

@router.post("", response_model=CodingProblemResponse)
async def create_coding_problem(
    payload: CodingProblemCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    # Find Level 2 round
    round_res = await db.execute(select(Round).where(Round.round_number == 2).limit(1))
    round_2 = round_res.scalar_one_or_none()
    if not round_2:
        raise HTTPException(status_code=400, detail="Round 2 (Coding) not found. Create round 2 first.")

    prob = CodingProblem(
        round_id=round_2.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        constraints=payload.constraints,
        time_limit_ms=payload.time_limit_ms,
        memory_limit_mb=payload.memory_limit_mb,
        marks=payload.marks,
        order_num=payload.order_num
    )
    db.add(prob)
    await db.flush()

    for tc in payload.test_cases:
        db.add(CodingTestCase(
            problem_id=prob.id,
            input_data=tc.input_data,
            expected_output=tc.expected_output,
            is_hidden=tc.is_hidden,
            order_num=tc.order_num
        ))

    await db.commit()
    # Reload with test cases
    reloaded = await db.execute(
        select(CodingProblem)
        .options(selectinload(CodingProblem.test_cases))
        .where(CodingProblem.id == prob.id)
    )
    return reloaded.scalar_one()

@router.put("/{problem_id}", response_model=CodingProblemResponse)
async def update_coding_problem(
    problem_id: str,
    payload: CodingProblemUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(
        select(CodingProblem)
        .options(selectinload(CodingProblem.test_cases))
        .where(CodingProblem.id == problem_id)
    )
    prob = result.scalar_one_or_none()
    if not prob:
        raise HTTPException(status_code=404, detail="Coding problem not found.")

    if payload.title is not None:
        prob.title = payload.title.strip()
    if payload.description is not None:
        prob.description = payload.description.strip()
    if payload.constraints is not None:
        prob.constraints = payload.constraints
    if payload.time_limit_ms is not None:
        prob.time_limit_ms = payload.time_limit_ms
    if payload.memory_limit_mb is not None:
        prob.memory_limit_mb = payload.memory_limit_mb
    if payload.marks is not None:
        prob.marks = payload.marks
    if payload.order_num is not None:
        prob.order_num = payload.order_num

    await db.commit()
    await db.refresh(prob)
    return prob

@router.delete("/{problem_id}")
async def delete_coding_problem(
    problem_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(CodingProblem).where(CodingProblem.id == problem_id))
    prob = result.scalar_one_or_none()
    if not prob:
        raise HTTPException(status_code=404, detail="Problem not found.")
    await db.delete(prob)
    await db.commit()
    return {"message": "Coding problem deleted successfully."}

# ─── Test Cases ───

@router.post("/{problem_id}/test-cases", response_model=CodingTestCaseResponse)
async def add_test_case(
    problem_id: str,
    payload: CodingTestCaseCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    prob_res = await db.execute(select(CodingProblem.id).where(CodingProblem.id == problem_id))
    if not prob_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Coding problem not found.")

    tc = CodingTestCase(
        problem_id=problem_id,
        input_data=payload.input_data,
        expected_output=payload.expected_output,
        is_hidden=payload.is_hidden,
        order_num=payload.order_num
    )
    db.add(tc)
    await db.commit()
    await db.refresh(tc)
    return tc

@router.delete("/test-cases/{test_case_id}")
async def delete_test_case(
    test_case_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin)
):
    result = await db.execute(select(CodingTestCase).where(CodingTestCase.id == test_case_id))
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Test case not found.")
    await db.delete(tc)
    await db.commit()
    return {"message": "Test case deleted successfully."}
