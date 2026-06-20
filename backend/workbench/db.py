"""SQLite persistence (spec §4). Identity + briefing state only — the seed World stays in
memory. SQLAlchemy 2.0 sync, create_all (no migration tool for a 2-table hackathon store)."""
from __future__ import annotations

# Some interpreters (e.g. a pyenv build without libsqlite3-dev) ship no stdlib `sqlite3`.
# Fall back to the bundled pysqlite3 so SQLite works everywhere; a no-op when sqlite3 exists
# (the normal case in Docker), so this never affects the deploy image.
try:  # pragma: no cover
    import sqlite3  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    import sys

    import pysqlite3  # type: ignore

    sys.modules["sqlite3"] = pysqlite3
    sys.modules["sqlite3.dbapi2"] = pysqlite3.dbapi2

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import DATA_DIR, settings

DATA_DIR.mkdir(parents=True, exist_ok=True)

# check_same_thread=False: the request threads and the APScheduler thread share the engine.
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
Base = declarative_base()


def init_db() -> None:
    """Create tables if absent; enable WAL for better SQLite concurrency."""
    from . import db_models  # noqa: F401 — registers the tables on Base.metadata

    Base.metadata.create_all(engine)
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA journal_mode=WAL")


def get_db() -> Iterator[Session]:
    """FastAPI dependency — one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
