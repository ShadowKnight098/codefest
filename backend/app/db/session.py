import ssl
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

# Build engine kwargs based on database type
engine_kwargs = {
    "echo": False,
    "future": True,
    "pool_pre_ping": True,
}

if settings.is_postgres:
    # PostgreSQL (Supabase Direct) — SSL + connection pooling for 400-500 users
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    engine_kwargs.update({
        "connect_args": {"ssl": ssl_context},
        "pool_size": 15,           # Base connections (Supabase Nano allows 60 direct)
        "max_overflow": 25,        # Burst capacity (total max = 40, well within 60 limit)
        "pool_timeout": 30,        # Wait up to 30s for a connection
        "pool_recycle": 300,       # Recycle connections every 5 min
    })
else:
    # SQLite — minimal pooling
    pass

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()

async def get_db():
    """Async session dependency for FastAPI endpoints."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
