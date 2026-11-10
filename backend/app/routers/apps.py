"""Apps dashboard, Add App (Azure DevOps picker), app settings, pull requests and cycle creation."""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, current_user, require
from app.integrations import get_scm
from app.models import App, Cycle, CycleStatus, RegressionCase, Role, TestCase, User
from app.serializers import app_out, cycle_out, fmt_dt
from app.services import audit

CYCLES_PAGE_SIZE = 20

router = APIRouter(tags=["apps"])


def get_app(db: Session, app_id: str) -> App:
    a = db.get(App, app_id)
    if not a:
        raise HTTPException(404, "App not found")
    return a


def _stats(db: Session, a: App) -> dict:
    open_cycles = db.scalar(select(func.count()).select_from(Cycle).where(Cycle.app_id == a.id, Cycle.status != CycleStatus.approved)) or 0
    reg = db.scalar(select(func.count()).select_from(RegressionCase).where(RegressionCase.app_id == a.id, RegressionCase.archived.is_(False))) or 0
    last = db.scalar(select(func.max(Cycle.approved_at)).where(Cycle.app_id == a.id))
    # All-time pass rate (by test-case status across all cycles)
    q_all = (select(TestCase.status, func.count()).join(Cycle)
             .where(Cycle.app_id == a.id, TestCase.deleted_at.is_(None))
             .group_by(TestCase.status))
    counts = {s.value: n for s, n in db.execute(q_all).all()}
    ran = counts.get("pass", 0) + counts.get("fail", 0)
    # 30-day pass rate: only cases recorded in the last 30 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    q_30 = (select(TestCase.status, func.count()).join(Cycle)
            .where(Cycle.app_id == a.id, TestCase.deleted_at.is_(None), TestCase.recorded_at >= cutoff)
            .group_by(TestCase.status))
    counts_30 = {s.value: n for s, n in db.execute(q_30).all()}
    ran_30 = counts_30.get("pass", 0) + counts_30.get("fail", 0)
    # Cycle-status counts for dashboard tags
    q_status = (select(Cycle.status, func.count()).select_from(Cycle)
                .where(Cycle.app_id == a.id).group_by(Cycle.status))
    sc = {st.value: n for st, n in db.execute(q_status).all()}
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    approved_today = db.scalar(
        select(func.count()).select_from(Cycle).where(
            Cycle.app_id == a.id, Cycle.status == CycleStatus.approved,
            Cycle.approved_at >= today_start)
    ) or 0
    return {
        "open": open_cycles, "reg": reg, "last": fmt_dt(last),
        "rate": round(100 * counts.get("pass", 0) / ran) if ran else None,
        "rate_30d": round(100 * counts_30.get("pass", 0) / ran_30) if ran_30 else None,
        "awaiting_review": sc.get(CycleStatus.ai_reviewed.value, 0),
        "approved_today": approved_today,
        "blocked": sc.get(CycleStatus.changes_requested.value, 0),
        "in_testing": sc.get(CycleStatus.assigned.value, 0) + sc.get(CycleStatus.in_testing.value, 0),
    }


@router.get("/apps")
def list_apps(cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return [app_out(a, **_stats(db, a)) for a in db.scalars(select(App).order_by(App.created_at)).all()]


class LinkApp(BaseModel):
    org: str
    project: str
    repo: str
    name: str
    branch: str = "main"
    provider: str = "azure_devops"


@router.post("/apps", status_code=201)
def link_app(b: LinkApp, cu: CurrentUser = Depends(require(Role.admin)), db: Session = Depends(get_db)):
    if db.scalar(select(App).where(App.org == b.org, App.project == b.project, App.repo == b.repo)):
        raise HTTPException(409, "Already linked")
    a = App(id=b.repo, name=b.name, initials="".join(w[0] for w in b.name.split()[:2]).upper(), provider=b.provider,
            org=b.org, project=b.project, repo=b.repo, target_branch=b.branch)
    db.add(a)
    audit.log(db, cycle_id=None, app_id=a.id, actor=cu.user, action=f"Linked {b.name}", detail=a.path, category="Workflow")
    db.commit()
    return app_out(a, **_stats(db, a))


@router.get("/apps/{app_id}")
def app_detail(app_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    a = get_app(db, app_id)
    return app_out(a, **_stats(db, a))


class AppSettings(BaseModel):
    target_branch: str | None = None
    default_tester_id: str | None = None
    approve_threshold: int | None = None
    ai_modes: dict[str, str] | None = None
    ai_inputs: dict[str, bool] | None = None
    modules: list | None = None  # [{id, name, risk, desc}] per-app module vocabulary


@router.patch("/apps/{app_id}/settings")
def update_settings(app_id: str, b: AppSettings, cu: CurrentUser = Depends(require(Role.admin)), db: Session = Depends(get_db)):
    a = get_app(db, app_id)
    for k, v in b.model_dump(exclude_unset=True).items():
        if k == "ai_modes" and v is not None and any(m not in ("ask", "azure", "claude") for m in v.values()):
            raise HTTPException(422, "Provider must be ask, azure or claude")
        setattr(a, k, v)
    db.commit()
    return app_out(a, **_stats(db, a))


@router.get("/apps/{app_id}/pull-requests")
def pull_requests(app_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    a = get_app(db, app_id)
    # Build a map: pr_number → list of cycles
    all_cycles = db.scalars(select(Cycle).where(Cycle.app_id == a.id)).all()
    cycles_for_pr: dict[int, list[Cycle]] = {}
    for c in all_cycles:
        if c.pr_number is not None:
            cycles_for_pr.setdefault(c.pr_number, []).append(c)

    def _pr_flags(pr_num: int) -> tuple[bool, str | None]:
        """Return (inCycle, draftId). A PR whose only cycles are all Draft-with-0-cases is selectable."""
        cycles = cycles_for_pr.get(pr_num, [])
        if not cycles:
            return False, None
        reusable_draft: Cycle | None = None
        has_other = False
        for c in cycles:
            active = sum(1 for t in c.cases if t.deleted_at is None)
            if c.status == CycleStatus.draft and active == 0:
                reusable_draft = c
            else:
                has_other = True
        if has_other:
            return True, None
        return False, reusable_draft.id if reusable_draft else None

    prs = get_scm(cu, a.provider).list_pull_requests(a.org, a.project, a.repo, a.target_branch)
    result = []
    for p in prs:
        in_cycle, draft_id = _pr_flags(p.number)
        result.append({
            "num": p.number, "title": p.title, "author": p.author, "branch": p.source_branch,
            "created": p.created, "items": p.work_items, "inCycle": in_cycle, "draftId": draft_id,
            "commits": [{"hash": c.hash, "message": c.message, "author": c.author, "aiNote": c.ai_note, "files": c.files} for c in p.commits],
        })
    return result


@router.delete("/apps/{app_id}/cycles/{cycle_id}", status_code=204)
def discard_draft_cycle(app_id: str, cycle_id: str, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    """Permanently delete a Draft cycle with no test cases. Used after a failed AI generation."""
    get_app(db, app_id)
    c = db.get(Cycle, cycle_id)
    if not c or c.app_id != app_id:
        raise HTTPException(404, "Cycle not found")
    if c.status != CycleStatus.draft:
        raise HTTPException(409, "Only Draft cycles can be discarded")
    if any(t.deleted_at is None for t in c.cases):
        raise HTTPException(409, "Cannot discard a cycle that has test cases")
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action="Discarded draft cycle", detail=c.name, tag="Discarded", tag_class="p-nr")
    db.delete(c)
    db.commit()


@router.get("/apps/{app_id}/cycles")
def list_cycles(app_id: str, status: str = "", tester: str = "", q: str = "",
                page: int = 1, page_size: int = CYCLES_PAGE_SIZE,
                cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """Paginated, filterable list for the App detail table.

    Filters: status (exact CycleStatus value), tester (user id), q (name or PR number).
    Returns {items, total, page, pages}.
    """
    from app.services.reports import build_report
    stmt = select(Cycle).where(Cycle.app_id == app_id)
    if status:
        stmt = stmt.where(Cycle.status == status)
    if tester:
        stmt = stmt.where(Cycle.tester_id == tester)
    if q:
        q_low = q.strip().lower()
        stmt = stmt.outerjoin(User, User.id == Cycle.tester_id)
        conds = [func.lower(Cycle.name).like(f"%{q_low}%")]
        if q_low.isdigit():
            conds.append(Cycle.pr_number == int(q_low))
        conds.append(func.lower(User.name).like(f"%{q_low}%"))
        conds.append(func.lower(cast(Cycle.authors, String)).like(f"%{q_low}%"))
        stmt = stmt.where(or_(*conds))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    page_size = max(1, page_size)
    page = max(1, page)
    cycles = db.scalars(stmt.order_by(Cycle.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    items = []
    for c in cycles:
        d = cycle_out(c, detail=False)
        d["score"] = build_report(db, c)["score"] if c.status in (CycleStatus.ai_reviewed, CycleStatus.approved, CycleStatus.changes_requested) else None
        items.append(d)
    return {"items": items, "total": total, "page": page, "pages": max(1, math.ceil(total / page_size))}


class NewCycle(BaseModel):
    name: str
    pr_numbers: list[int]
    commit_shas: list[str]


@router.post("/apps/{app_id}/cycles", status_code=201)
def create_cycle(app_id: str, b: NewCycle, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    """Creates a Draft cycle from the chosen PRs/commits. Generating test cases is a separate AI run."""
    a = get_app(db, app_id)
    scm = get_scm(cu, a.provider)
    prs = {p.number: p for p in scm.list_pull_requests(a.org, a.project, a.repo, a.target_branch)}
    chosen = [prs[n] for n in b.pr_numbers if n in prs]
    if not chosen:
        raise HTTPException(422, "Select at least one pull request")
    p = chosen[0]
    commit_shas = set(b.commit_shas)
    all_commits = [c for pr in chosen for c in pr.commits if c.hash in commit_shas]
    if not all_commits:
        raise HTTPException(422, "Select at least one commit")
    # Fetch and merge files from each PR separately to avoid cross-PR confusion
    files_map: dict[str, dict] = {}
    for pr in chosen:
        pr_hashes = [c.hash for c in pr.commits if c.hash in commit_shas]
        if not pr_hashes:
            continue
        for f in scm.get_changes(a.org, a.project, a.repo, pr.number, pr_hashes):
            if f.path in files_map:
                files_map[f.path]["added"] += f.added
                files_map[f.path]["removed"] += f.removed
            else:
                files_map[f.path] = {"status": f.status, "path": f.path, "added": f.added, "removed": f.removed}
    all_files = list(files_map.values())
    kind = "pr" if len(chosen) == 1 else "release"
    c = Cycle(app_id=a.id, name=b.name, kind=kind, pr_number=p.number, pr_title=p.title,
              pr_numbers=[pr.number for pr in chosen],
              source_branch=p.source_branch, target_branch=a.target_branch,
              authors=sorted({x.author for x in all_commits}), created_by_id=cu.user.id,
              commits=[{"hash": x.hash, "message": x.message, "author": x.author, "ai_note": x.ai_note, "files": x.files} for x in all_commits],
              files=all_files,
              work_items=sorted({w for pr in chosen for w in pr.work_items}))
    db.add(c)
    db.flush()
    if kind == "release":
        pr_list = ", ".join(f"#{pr.number}" for pr in chosen)
        action = f"Created release cycle from PRs {pr_list}"
        detail = f"{len(all_commits)} commits · {len(all_files)} files · {len(chosen)} PRs"
    else:
        action = f"Created the cycle and pulled PR #{p.number} from Azure DevOps"
        detail = f"{len(all_commits)} commits · {sum(x.files for x in all_commits)} files"
    audit.log(db, cycle_id=c.id, app_id=a.id, actor=cu.user, action=action, detail=detail, tag="Draft", tag_class="p-nr")
    db.commit()
    return cycle_out(c)
