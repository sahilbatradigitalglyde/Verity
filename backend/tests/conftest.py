import os
import tempfile

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.update({"DATABASE_URL": f"sqlite:///{_db}", "AUTH_DEV_BYPASS": "true", "AI_MODE": "demo", "SCM_MODE": "demo",
                   "CORS_ORIGINS": "http://localhost:5173"})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture()
def client():
    seed(reset=True)
    return TestClient(app)


def as_(who: str) -> dict:
    return {"X-Demo-User": who}
