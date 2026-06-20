import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from workbench.config import settings  # noqa: E402

# Test isolation: never start the background scheduler, never touch the dev SQLite db.
settings.scheduler_enabled = False
settings.database_url = f"sqlite:///{tempfile.mkdtemp()}/test.db"

from workbench.seed import build_world  # noqa: E402


@pytest.fixture(scope="session")
def world():
    return build_world()
