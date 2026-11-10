"""AI job status endpoint: GET /ai-jobs/{id}."""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, current_user
from app.models import AiJob
from app.serializers import fmt_dt

router = APIRouter(tags=["ai_jobs"])


def _parse_error(s: str):
    try:
        return json.loads(s)
    except (ValueError, TypeError):
        return s


@router.get("/ai-jobs/{job_id}")
def get_ai_job(job_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    job: AiJob | None = db.get(AiJob, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {
        "id": job.id,
        "task": job.task,
        "provider": job.provider,
        "status": job.status,
        "step": job.step,
        "steps": job.steps,
        "result": job.result,
        "ai_run_id": job.ai_run_id,
        "error": _parse_error(job.error) if job.error else None,
        "created_at": fmt_dt(job.created_at),
        "finished_at": fmt_dt(job.finished_at),
    }
