import pytest
import pytest_asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import engine

@pytest_asyncio.fixture(autouse=True, scope="function")
async def cleanup_db_connections():
    """Ensure engine connections are cleanly disposed between test functions."""
    yield
    # Dispose active connections after each test function finishes
    await engine.dispose()
