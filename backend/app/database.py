"""Подключение к базе данных.

DATABASE_URL читается из backend/.env (см. .env.example). Файл .env в
репозиторий не попадает — в нём живёт пароль локального PostgreSQL.
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent  # каталог backend/

DEFAULT_URL = "postgresql+psycopg2://postgres:postgres@localhost:5432/funds_lab"


def _load_env() -> dict[str, str]:
    """Мини-парсер .env: KEY=VALUE, '#' — комментарии. Без внешних зависимостей."""
    env: dict[str, str] = {}
    path = BASE_DIR / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


DATABASE_URL = _load_env().get("DATABASE_URL", DEFAULT_URL)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Базовый класс всех ORM-моделей."""


def get_db():
    """FastAPI-зависимость: сессия SQLAlchemy на время запроса."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
