import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import text
from app.core.config import settings
from app.db.session import engine, Base
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.mcq import router as mcq_router
from app.api.admin_auth import router as admin_auth_router
from app.api.admin_competitions import router as admin_competitions_router
from app.api.admin_participants import router as admin_participants_router
from app.api.admin_questions import router as admin_questions_router
from app.api.admin_coding import router as admin_coding_router
from app.api.admin_monitor import router as admin_monitor_router
from app.api.admin_settings import router as admin_settings_router
from app.api.admin_organizers import router as admin_organizers_router
from app.api.admin_presentation import router as admin_presentation_router
from app.api.admin_nodes import router as admin_nodes_router
from app.api.coding import router as coding_router
from app.api.security import router as security_router

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "name": "%(name)s", "message": "%(message)s"}'
)
logger = logging.getLogger("fest-platform")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure database tables exist (skip if already created or fast timeout)
    logger.info("Application starting up...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Safe migration: ensure starter_code column exists
            try:
                await conn.execute(text("ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS starter_code TEXT;"))
            except Exception:
                try:
                    await conn.execute(text("ALTER TABLE coding_problems ADD COLUMN starter_code TEXT;"))
                except Exception:
                    pass

            # Safe migration: ensure difficulty column exists in coding_problems
            try:
                await conn.execute(text("ALTER TABLE coding_problems ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'EASY';"))
            except Exception:
                try:
                    await conn.execute(text("ALTER TABLE coding_problems ADD COLUMN difficulty VARCHAR(20) DEFAULT 'EASY';"))
                except Exception:
                    pass

            # Safe migration: ensure assigned_problem_ids column exists in coding_attempts
            try:
                await conn.execute(text("ALTER TABLE coding_attempts ADD COLUMN IF NOT EXISTS assigned_problem_ids TEXT;"))
            except Exception:
                try:
                    await conn.execute(text("ALTER TABLE coding_attempts ADD COLUMN assigned_problem_ids TEXT;"))
                except Exception:
                    pass

            # Standardize marks: 15 for EASY, 30 for HARD
            try:
                await conn.execute(text("UPDATE coding_problems SET marks = 15, difficulty = 'EASY' WHERE order_num = 1 OR difficulty = 'EASY' OR marks <= 20;"))
                await conn.execute(text("UPDATE coding_problems SET marks = 30, difficulty = 'HARD' WHERE order_num >= 2 AND (difficulty = 'HARD' OR marks > 20);"))
            except Exception:
                pass
        logger.info("Database schema verified.")
    except Exception as e:
        logger.warning(f"Schema check skipped or already present: {e}")
    yield
    # Shutdown
    logger.info("Shutting down application...")
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Official AI/ML Department Technical Competition Platform API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://codefest2.vercel.app",
        "https://codefest2.vercel.app/",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        *settings.CORS_ORIGINS,
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Global error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please contact the competition administrator."}
    )

# Include Routers
app.include_router(auth_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(mcq_router, prefix="/api")

# Admin Routers
app.include_router(admin_auth_router, prefix="/api")
app.include_router(admin_competitions_router, prefix="/api")
app.include_router(admin_participants_router, prefix="/api")
app.include_router(admin_questions_router, prefix="/api")
app.include_router(admin_coding_router, prefix="/api")
app.include_router(admin_monitor_router, prefix="/api")
app.include_router(admin_settings_router, prefix="/api")
app.include_router(admin_organizers_router, prefix="/api")
app.include_router(admin_presentation_router, prefix="/api")
app.include_router(admin_nodes_router, prefix="/api")

# Assessment Execution & Security
app.include_router(coding_router, prefix="/api")
app.include_router(security_router, prefix="/api")

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "system": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT
    }

# ─── Production SPA Static Files ───
import os
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse

frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.isdir(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Don't intercept /api routes
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API endpoint not found.")
        file_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
