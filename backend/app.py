"""Entry point: `cd backend && uvicorn app:app --reload` (CLAUDE.md §5)."""
from workbench.api import app

__all__ = ["app"]
