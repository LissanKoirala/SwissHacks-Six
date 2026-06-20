import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from workbench.config import settings  # noqa: E402

# Test isolation: never start the background scheduler, never touch the dev SQLite db.
settings.scheduler_enabled = False
settings.database_url = f"sqlite:///{tempfile.mkdtemp()}/test.db"

# Redirect the Front Door task-board write-through store to a throwaway temp path BEFORE any test
# module imports create_app() (which bootstraps + persists the board at import time). Keeps the
# repo's git-ignored data/tasks.json untouched during the suite.
from workbench import taskboard  # noqa: E402

taskboard.TASKS_PATH = Path(tempfile.mkdtemp(prefix="aw-tasks-")) / "tasks.json"

from workbench.seed import build_world  # noqa: E402


@pytest.fixture(scope="session")
def world():
    return build_world()
