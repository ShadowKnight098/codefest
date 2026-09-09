import ssl
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

engine_kwargs = {
    "echo": False,
    "future": True,
    "pool_pre_ping": True,
}

if settings.is_postgres:
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    engine_kwargs.update({
        "connect_args": {"ssl": ssl_context},
        "pool_size": 40,
        "max_overflow": 60,
        "pool_timeout": 30,
        "pool_recycle": 300,
    })

    # asyncpg needs the +asyncpg scheme, and doesn't understand
    # libpq-style query params (sslmode, channel_binding) — SSL is
    # already handled above via connect_args.
    db_url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    db_url = db_url.split("?")[0]
else:
    db_url = settings.DATABASE_URL

engine = create_async_engine(db_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session