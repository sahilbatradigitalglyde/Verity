"""The reply checker rejects bad replies and the service retries once with the errors fed back."""
import json

import pytest
from fastapi import HTTPException

from app.ai import service
from app.ai.providers.base import ProviderResult
from app.core.db import SessionLocal
from app.models import App
from app.seed import seed


class Flaky:
    """First reply has the wrong run_id; second is correct."""
    key = "claude"

    def __init__(self):
        self.calls = 0

    def complete_json(self, *, system, messages, schema, schema_name):
        self.calls += 1
        run_id = messages[0].content.split("- run_id: ")[1].split("\n")[0]
        data = {"run_id": run_id if self.calls > 1 else "VR-WRONG", "task": "find_duplicates", "schema_version": "1.0",
                "pairs": [{"a": "REG-118", "b": "REG-131", "reason": "same"}]}
        return ProviderResult(data=data, raw=json.dumps(data), model="test")


class Broken:
    key = "azure"

    def complete_json(self, **kw):
        data = {"run_id": "x", "task": "find_duplicates", "pairs": [{"a": "REG-999", "b": "REG-118", "reason": "?"}]}
        return ProviderResult(data=data, raw=json.dumps(data), model="test")


def test_retry_then_success(monkeypatch):
    seed(reset=True)
    p = Flaky()
    monkeypatch.setattr(service, "get_provider", lambda k: p)
    with SessionLocal() as db:
        run, reply = service.run_task(db, task="dups", provider_key="claude", app=db.get(App, "claims"), cycle=None, actor=None)
        assert run.attempts == 2 and run.status == "succeeded" and p.calls == 2


def test_gives_up_with_readable_errors(monkeypatch):
    seed(reset=True)
    monkeypatch.setattr(service, "get_provider", lambda k: Broken())
    with SessionLocal() as db:
        with pytest.raises(HTTPException) as e:
            service.run_task(db, task="dups", provider_key="azure", app=db.get(App, "claims"), cycle=None, actor=None)
        errs = e.value.detail["errors"]
        assert any("REG-999" in x for x in errs) and any("run_id" in x for x in errs)
