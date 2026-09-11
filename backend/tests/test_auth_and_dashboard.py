import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.core.config import settings

@pytest.mark.asyncio
async def test_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

@pytest.mark.asyncio
async def test_login_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/auth/login",
            json={
                "roll_number": "25091A04H6",
                "email": "sadiyadudekula07@gmail.com",
                "pin": "25091A04H6"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["roll_number"] == "25091A04H6"
        assert data["academic_year"] == 2
        assert settings.SESSION_COOKIE_NAME in response.cookies

@pytest.mark.asyncio
async def test_login_invalid_pin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/auth/login",
            json={
                "roll_number": "25091A04H6",
                "email": "sadiyadudekula07@gmail.com",
                "pin": "WRONG_PASSWORD_999"
            }
        )
        assert response.status_code == 401
        data = response.json()
        assert "Invalid Password" in data["detail"]

@pytest.mark.asyncio
async def test_auth_me_and_dashboard_marks():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login
        login_res = await ac.post(
            "/api/auth/login",
            json={
                "roll_number": "25091A04H6",
                "email": "sadiyadudekula07@gmail.com",
                "pin": "25091A04H6"
            }
        )
        assert login_res.status_code == 200
        cookies = login_res.cookies

        # 2. Get Me
        me_res = await ac.get("/api/auth/me", cookies=cookies)
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["roll_number"] == "25091A04H6"

        # 3. Get Dashboard State
        dash_res = await ac.get("/api/dashboard/state", cookies=cookies)
        assert dash_res.status_code == 200

        # 4. Get Participant Marks (New Endpoint)
        marks_res = await ac.get("/api/dashboard/marks", cookies=cookies)
        assert marks_res.status_code == 200
        marks_data = marks_res.json()
        assert marks_data["roll_number"] == "25091A04H6"
        assert marks_data["mcq_max_marks"] == 25
        assert marks_data["coding_max_marks"] == 45
        assert marks_data["max_total_marks"] == 70

        # 5. Logout
        logout_res = await ac.post("/api/auth/logout", cookies=cookies)
        assert logout_res.status_code == 200
