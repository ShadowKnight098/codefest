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
                "roll_number": "23AIML001",
                "email": "aarav.sharma@aiml.edu",
                "pin": "123456"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["roll_number"] == "23AIML001"
        assert data["name"] == "Aarav Sharma"
        assert data["academic_year"] == 2
        # Check that session cookie was set
        assert settings.SESSION_COOKIE_NAME in response.cookies

@pytest.mark.asyncio
async def test_login_invalid_pin():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/auth/login",
            json={
                "roll_number": "23AIML001",
                "email": "aarav.sharma@aiml.edu",
                "pin": "999999" # wrong PIN
            }
        )
        assert response.status_code == 401
        data = response.json()
        assert "Invalid Access PIN" in data["detail"]

@pytest.mark.asyncio
async def test_auth_me_and_dashboard():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login
        login_res = await ac.post(
            "/api/auth/login",
            json={
                "roll_number": "23AIML042",
                "email": "diya.patel@aiml.edu",
                "pin": "567890"
            }
        )
        assert login_res.status_code == 200
        cookies = login_res.cookies

        # 2. Get Me
        me_res = await ac.get("/api/auth/me", cookies=cookies)
        assert me_res.status_code == 200
        me_data = me_res.json()
        assert me_data["roll_number"] == "23AIML042"

        # 3. Get Dashboard State (server-authoritative)
        dash_res = await ac.get("/api/dashboard/state", cookies=cookies)
        assert dash_res.status_code == 200
        dash_data = dash_res.json()
        assert dash_data["state"] == "LEVEL1_AVAILABLE"
        assert dash_data["can_start_level1"] is True
        assert dash_data["can_start_level2"] is False # Level 2 is closed and Level 1 not submitted

        # 4. Logout
        logout_res = await ac.post("/api/auth/logout", cookies=cookies)
        assert logout_res.status_code == 200
