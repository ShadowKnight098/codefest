import pytest
from httpx import AsyncClient, ASGITransport
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app

@pytest.mark.asyncio
async def test_mcq_full_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Login with Anjali Rao
        login_res = await ac.post(
            "/api/auth/login",
            json={
                "roll_number": "21A91A6127",
                "email": "anjali.rao@rgmcet.edu.in",
                "pin": "654321"
            }
        )
        assert login_res.status_code == 200
        cookies = login_res.cookies

        # 2. Get or Start MCQ Attempt
        att_res = await ac.get("/api/mcq/attempt", cookies=cookies)
        assert att_res.status_code == 200
        att_data = att_res.json()
        assert "attempt_id" in att_data
        assert att_data["status"] == "IN_PROGRESS"
        assert len(att_data["questions"]) >= 25
        assert att_data["remaining_seconds"] > 0
        
        attempt_id = att_data["attempt_id"]
        first_q = att_data["questions"][0]

        # 3. Save an answer
        ans_res = await ac.post(
            "/api/mcq/answer",
            json={
                "attempt_id": attempt_id,
                "question_id": first_q["question_id"],
                "selected_option": "B"
            },
            cookies=cookies
        )
        assert ans_res.status_code == 200
        assert ans_res.json()["status"] == "saved"

        # 4. Verify answer persisted
        att_res2 = await ac.get("/api/mcq/attempt", cookies=cookies)
        assert att_res2.status_code == 200
        assert att_res2.json()["questions"][0]["selected_option"] == "B"
        assert att_res2.json()["answered_count"] >= 1

        # 5. Submit attempt
        submit_res = await ac.post(
            "/api/mcq/submit",
            json={"attempt_id": attempt_id},
            cookies=cookies
        )
        assert submit_res.status_code == 200
        sub_data = submit_res.json()
        assert sub_data["status"] == "SUBMITTED"
        assert "score" in sub_data
        assert "is_qualified" in sub_data
