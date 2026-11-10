"""Azure DevOps service hooks (and later GitHub webhooks): keep cycles in sync when a PR changes."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import App, Cycle, CycleStatus
from app.services import audit

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/azure-devops")
async def azure_devops(req: Request, db: Session = Depends(get_db)):
    """git.pullrequest.updated: if new commits land on a PR that is already being tested, flag it on the cycle."""
    body = await req.json()
    res = body.get("resource", {})
    repo = res.get("repository", {}).get("name")
    num = res.get("pullRequestId")
    app = db.scalar(select(App).where(App.repo == repo)) if repo else None
    if not app or not num:
        return {"ok": True, "matched": False}
    for c in db.scalars(select(Cycle).where(Cycle.app_id == app.id, Cycle.pr_number == num, Cycle.status != CycleStatus.approved)).all():
        audit.log(db, cycle_id=c.id, app_id=app.id, actor=None, actor_kind="system",
                  action=f"PR #{num} was updated in Azure DevOps", detail=body.get("message", {}).get("text", ""))
    db.commit()
    return {"ok": True, "matched": True}
