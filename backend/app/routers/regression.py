"""Regression suite library: search, tag, archive, export, AI duplicate scan and merge."""
import csv
import io
import math

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.orm import Session

REG_PAGE_SIZE = 50

from app.jobs.runner import task_steps, execute_ai_job
from app.core.db import get_db
from app.core.security import CurrentUser, current_user, require
from app.models import AiJob, RegressionCase, Role
from app.routers.apps import get_app
from app.serializers import regression_out
from app.services import audit

router = APIRouter(tags=["regression"])


def _rows(db: Session, app_id: str, q: str = "", module: str = "All", result: str = "All"):
    rows = db.scalars(select(RegressionCase).where(RegressionCase.app_id == app_id, RegressionCase.archived.is_(False))
                      .order_by(RegressionCase.id)).all()
    q = q.strip().lower()
    return [r for r in rows if (not q or q in f"{r.id} {r.title} {' '.join(r.tags)}".lower())
            and (module == "All" or r.module == module) and (result == "All" or r.last_result == result)]


@router.get("/apps/{app_id}/regression")
def list_regression(app_id: str, q: str = "", module: str = "All", result: str = "All",
                    page: int = 1, page_size: int = REG_PAGE_SIZE,
                    cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """Paginated, server-side-filtered regression suite list.

    Filters: q (id or title), module, result. Returns {items, total, page, pages}.
    """
    stmt = select(RegressionCase).where(RegressionCase.app_id == app_id, RegressionCase.archived.is_(False))
    if q:
        q_low = q.strip().lower()
        stmt = stmt.where(or_(
            func.lower(RegressionCase.id).like(f"%{q_low}%"),
            func.lower(RegressionCase.title).like(f"%{q_low}%"),
            func.lower(cast(RegressionCase.tags, Text)).like(f"%{q_low}%"),
        ))
    if module != "All":
        stmt = stmt.where(RegressionCase.module == module)
    if result != "All":
        stmt = stmt.where(RegressionCase.last_result == result)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    page_size = max(1, page_size)
    page = max(1, page)
    rows = db.scalars(stmt.order_by(RegressionCase.id).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [regression_out(r) for r in rows], "total": total, "page": page, "pages": max(1, math.ceil(total / page_size))}


class Ids(BaseModel):
    ids: list[str]


class TagIn(Ids):
    tag: str = Field(min_length=1)


@router.post("/apps/{app_id}/regression/tag")
def tag(app_id: str, b: TagIn, cu: CurrentUser = Depends(require(Role.senior_developer, Role.tester_lead)), db: Session = Depends(get_db)):
    t = b.tag.strip().lstrip("#")
    for r in db.scalars(select(RegressionCase).where(RegressionCase.app_id == app_id, RegressionCase.id.in_(b.ids))).all():
        if t not in r.tags:
            r.tags = [*r.tags, t]
    db.commit()
    return {"tagged": len(b.ids)}


@router.post("/apps/{app_id}/regression/archive")
def archive(app_id: str, b: Ids, cu: CurrentUser = Depends(require(Role.senior_developer, Role.tester_lead)), db: Session = Depends(get_db)):
    for r in db.scalars(select(RegressionCase).where(RegressionCase.app_id == app_id, RegressionCase.id.in_(b.ids))).all():
        r.archived = True
    audit.log(db, cycle_id=None, app_id=app_id, actor=cu.user, action=f"Archived {len(b.ids)} regression cases", detail=", ".join(b.ids))
    db.commit()
    return {"archived": len(b.ids)}


@router.get("/apps/{app_id}/regression/export.csv")
def export(app_id: str, ids: str = "", cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    rows = _rows(db, app_id)
    if ids:
        keep = set(ids.split(","))
        rows = [r for r in rows if r.id in keep]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "title", "module", "priority", "last_run", "last_result", "source"])
    w.writerows([[r.id, r.title, r.module, r.priority, r.last_run, r.last_result, r.source_cycle] for r in rows])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{app_id}-regression.csv"'})


class ScanIn(BaseModel):
    provider: str = Field(pattern="^(azure|claude)$")


@router.post("/apps/{app_id}/regression/scan-duplicates", status_code=202)
def scan_duplicates(app_id: str, b: ScanIn, background_tasks: BackgroundTasks,
                    cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    a = get_app(db, app_id)
    job = AiJob(task="dups", provider=b.provider, cycle_id=None, app_id=a.id,
                steps=task_steps("dups", b.provider), started_by_id=cu.user.id)
    db.add(job)
    db.commit()
    background_tasks.add_task(execute_ai_job, job.id)
    return {"job_id": job.id}


class MergeIn(BaseModel):
    keep: str
    drop: str


@router.post("/apps/{app_id}/regression/merge")
def merge(app_id: str, b: MergeIn, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    keep, drop = db.get(RegressionCase, b.keep), db.get(RegressionCase, b.drop)
    if not keep or not drop or keep.app_id != app_id or drop.app_id != app_id:
        raise HTTPException(404, "Case not found")
    drop.archived = True
    keep.duplicate_of = keep.duplicate_reason = ""
    keep.tags = sorted(set(keep.tags) | set(drop.tags))
    keep.source_cycle = keep.source_cycle if drop.source_cycle in keep.source_cycle else f"{keep.source_cycle}, {drop.source_cycle}"
    audit.log(db, cycle_id=None, app_id=app_id, actor=cu.user, action=f"Merged {b.drop} into {b.keep}")
    db.commit()
    return regression_out(keep)
