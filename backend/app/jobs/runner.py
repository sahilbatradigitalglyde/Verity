"""Background task runner for async AI jobs.

Each job runs run_task() in a fresh DB session and updates the AiJob row
as it progresses so the polling endpoint can report step changes.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import HTTPException

from app.ai.service import run_task
from app.core.db import SessionLocal
from app.models import AiJob, App, Cycle, User

PROVIDER_LABEL = {"azure": "Azure OpenAI", "claude": "Claude"}


def task_steps(task: str, provider: str) -> list[str]:
    p = PROVIDER_LABEL.get(provider, provider)
    steps = {
        "gen":      ["Reading diffs from Azure DevOps", "Reading AI commit notes and linked work items", f"Sending to {p}", "Checking the response format", "Matching against the regression suite"],
        "regen":    ["Re-reading the diff", f"Sending to {p}", "Keeping your edited cases"],
        "validate": ["Collecting results and evidence", f"Sending to {p}", "Checking the response format"],
        "bug":      ["Collecting the failed case and evidence", f"Sending to {p}"],
        "dups":     ["Loading the regression suite", f"Sending to {p}", "Checking the response format"],
    }
    return steps[task]


def execute_ai_job(job_id: str, extra: dict | None = None) -> None:
    """Executes an AI task and writes progress back to the ai_jobs row."""
    extra = extra or {}
    db = SessionLocal()
    try:
        job: AiJob | None = db.get(AiJob, job_id)
        if not job:
            return

        job.status = "running"
        job.step = 1
        db.commit()

        cycle: Cycle | None = db.get(Cycle, job.cycle_id) if job.cycle_id else None
        app: App | None = db.get(App, job.app_id)
        actor: User | None = db.get(User, job.started_by_id) if job.started_by_id else None

        if job.task == "bug" and "case_key" in extra:
            case_key = extra.pop("case_key")
            extra["case"] = next((t for t in cycle.cases if t.key == case_key), None) if cycle else None

        job.step = 2
        db.commit()

        # gen has 5 steps; "Sending to" is step 3, so advance past step 2 before calling
        if job.task == "gen":
            job.step = 3
            db.commit()

        try:
            run, reply = run_task(
                db,
                task=job.task,
                provider_key=job.provider,
                app=app,
                cycle=cycle,
                actor=actor,
                extra=extra,
            )
        except HTTPException as exc:
            job.status = "failed"
            detail = exc.detail
            job.error = json.dumps(detail) if isinstance(detail, dict) else str(detail)
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            return

        result: dict = {
            "run": {"id": run.id, "provider": run.provider, "model": run.model, "attempts": run.attempts}
        }
        if job.task in ("gen", "regen") and cycle:
            db.refresh(cycle)
            result["case_count"] = sum(1 for t in cycle.cases if t.deleted_at is None)
        if job.task == "validate" and cycle:
            from app.services.reports import build_report
            result["report"] = build_report(db, cycle)
        if job.task == "bug":
            result["draft"] = reply.model_dump()
        if job.task == "dups":
            result["pairs"] = [p.model_dump() for p in reply.pairs]

        job.status = "succeeded"
        job.step = len(job.steps)
        job.result = result
        job.ai_run_id = run.id
        job.finished_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as exc:
        try:
            job = db.get(AiJob, job_id)
            if job and job.status not in ("succeeded", "failed"):
                job.status = "failed"
                job.error = str(exc)
                job.finished_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
    finally:
        db.close()
