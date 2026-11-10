"""Cycle endpoints: AI runs, test case curation, assignment, execution, submission, report, approval, audit."""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.service import run_task
from app.jobs.runner import task_steps, execute_ai_job
from app.core.db import get_db
from app.core.security import CurrentUser, current_user, require
from app.integrations import get_scm
from app.models import AiJob, AuditEvent, Cycle, CycleStatus, Evidence, RegressionCase, ResultStatus, Role, TestCase, User
from app.serializers import audit_out, case_out, cycle_out
from app.services import audit, workflow
from app.services.reports import build_report
from app.storage.evidence import upload_url

router = APIRouter(tags=["cycles"])
RESULT_TAG = {"pass": ("Pass", "p-pass"), "fail": ("Fail", "p-fail"), "blocked": ("Blocked", "p-blk"), "na": ("Not Applicable", "p-nr")}


def get_cycle(db: Session, cycle_id: str) -> Cycle:
    c = db.get(Cycle, cycle_id)
    if not c:
        raise HTTPException(404, "Cycle not found")
    return c


def get_case(c: Cycle, key: str) -> TestCase:
    t = next((x for x in c.cases if x.key == key and x.deleted_at is None), None)
    if not t:
        raise HTTPException(404, f"{key} not found")
    return t


def _get_deleted_case(c: Cycle, key: str) -> TestCase:
    t = next((x for x in c.cases if x.key == key and x.deleted_at is not None), None)
    if not t:
        raise HTTPException(404, f"{key} not found or is not deleted")
    return t


def _check_version(current: int, if_match: str | None) -> None:
    if if_match is None:
        raise HTTPException(428, "If-Match header is required for this write")
    try:
        v = int(if_match)
    except ValueError:
        raise HTTPException(400, "If-Match must be an integer version number")
    if v != current:
        raise HTTPException(409, f"Version conflict: the case was modified (current version: {current})")


def _editable(c: Cycle):
    if c.status not in workflow.CASES_EDITABLE:
        raise HTTPException(409, "Cases are locked while the cycle is with the tester")


def _tester_can_edit(c: Cycle, cu: CurrentUser):
    if c.status not in workflow.TESTER_EDITABLE:
        raise HTTPException(409, "Results are read-only in this state")
    if cu.role != Role.admin and c.tester_id != cu.user.id:
        raise HTTPException(403, "Only the assigned tester can record results")


def _next_key(c: Cycle) -> str:
    return f"TC-{max([int(t.key[3:]) for t in c.cases] + [0]) + 1:02d}"


def _start_testing(db: Session, c: Cycle, cu: CurrentUser):
    if c.status in (CycleStatus.assigned, CycleStatus.changes_requested):
        was = c.status
        tag = workflow.transition(c, CycleStatus.in_testing, Role.tester)
        audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user,
                  action="Started testing" if was == CycleStatus.assigned else "Resumed testing after changes were requested", tag=tag)


@router.get("/cycles/{cycle_id}")
def cycle_detail(cycle_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return cycle_out(get_cycle(db, cycle_id))


# ---------- AI ----------

class AiRunIn(BaseModel):
    task: str = Field(pattern="^(gen|regen|validate|bug)$")
    provider: str = Field(pattern="^(azure|claude)$")
    case_key: str | None = None  # for task=bug


@router.post("/cycles/{cycle_id}/ai-runs", status_code=202)
def ai_run(cycle_id: str, b: AiRunIn, background_tasks: BackgroundTasks,
           cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """Enqueues an AI step as a background job; poll GET /ai-jobs/{job_id} for progress."""
    c = get_cycle(db, cycle_id)
    a = c.app
    extra: dict = {}
    if b.task in ("gen", "regen", "validate") and cu.role not in (Role.senior_developer, Role.admin):
        raise HTTPException(403, "Only senior developers run this AI step")
    if b.task == "gen" and c.status != CycleStatus.draft:
        raise HTTPException(409, "Test cases were already generated. Use Regenerate.")
    if b.task == "regen":
        _editable(c)
    if b.task == "validate" and c.status not in (CycleStatus.submitted, CycleStatus.ai_reviewed):
        raise HTTPException(409, "AI validation runs after the tester submits")
    if b.task == "bug":
        extra["case_key"] = b.case_key or ""
        get_case(c, extra["case_key"])  # 404-guard while we still have the session
    if b.task in ("gen", "regen"):
        scm = get_scm(cu, a.provider)
        if a.ai_inputs.get("work_items", True):
            extra["work_item_criteria"] = scm.get_work_item_criteria(a.org, a.project, c.work_items)
    job = AiJob(task=b.task, provider=b.provider, cycle_id=c.id, app_id=a.id,
                steps=task_steps(b.task, b.provider), started_by_id=cu.user.id)
    db.add(job)
    db.commit()
    background_tasks.add_task(execute_ai_job, job.id, extra)
    return {"job_id": job.id}


# ---------- test case curation (senior developer) ----------

class CaseIn(BaseModel):
    title: str
    type: str = Field(pattern="^(Functional|Edge case|Negative|Regression)$")
    pri: str = Field(pattern="^P[123]$")
    mod: str
    file: str = ""
    pre: str = ""
    steps: list[str] = Field(min_length=1)
    exp: str = ""


@router.post("/cycles/{cycle_id}/cases", status_code=201)
def add_case(cycle_id: str, b: CaseIn, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _editable(c)
    t = TestCase(cycle_id=c.id, key=_next_key(c), position=len(c.cases) + 1, title=b.title, type=b.type, priority=b.pri, module=b.mod,
                 linked_file=b.file, source="manual", preconditions=b.pre, steps=b.steps, expected=b.exp)
    c.cases.append(t)
    c.version += 1
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Added {t.key} manually", detail=t.title, category="Test cases")
    db.commit()
    return case_out(t)


@router.patch("/cycles/{cycle_id}/cases/{key}")
def edit_case(cycle_id: str, key: str, b: CaseIn, if_match: str | None = Header(None),
              cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _editable(c)
    t = get_case(c, key)
    _check_version(t.version, if_match)
    t.title, t.type, t.priority, t.module, t.linked_file, t.preconditions, t.steps, t.expected = b.title, b.type, b.pri, b.mod, b.file, b.pre, b.steps, b.exp
    t.edited = True
    t.version += 1
    c.version += 1
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Edited {key}", detail=t.title, category="Test cases")
    db.commit()
    return case_out(t)


@router.post("/cycles/{cycle_id}/cases/{key}/duplicate", status_code=201)
def duplicate_case(cycle_id: str, key: str, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _editable(c)
    src = get_case(c, key)
    t = TestCase(cycle_id=c.id, key=_next_key(c), position=src.position, title=src.title + " (copy)", type=src.type, priority=src.priority,
                 module=src.module, linked_file=src.linked_file, source=src.source, preconditions=src.preconditions, steps=list(src.steps),
                 expected=src.expected, edited=True)
    c.cases.insert(c.cases.index(src) + 1, t)
    for i, x in enumerate(c.cases, 1):
        x.position = i
    c.version += 1
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Duplicated {key} as {t.key}", category="Test cases")
    db.commit()
    return case_out(t)


@router.delete("/cycles/{cycle_id}/cases/{key}", status_code=204)
def delete_case(cycle_id: str, key: str, if_match: str | None = Header(None),
                cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _editable(c)
    t = get_case(c, key)
    _check_version(t.version, if_match)
    t.deleted_at = datetime.now(timezone.utc)
    c.version += 1
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Deleted {key}", detail=t.title, category="Test cases")
    db.commit()


@router.post("/cycles/{cycle_id}/cases/{key}/restore")
def restore_case(cycle_id: str, key: str, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    """Undoes a soft delete; powers the Undo toast in the UI."""
    c = get_cycle(db, cycle_id)
    _editable(c)
    t = _get_deleted_case(c, key)
    t.deleted_at = None
    t.version += 1
    c.version += 1
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Restored {key}", detail=t.title, category="Test cases")
    db.commit()
    return case_out(t)


@router.post("/cycles/{cycle_id}/cases/{key}/promote")
def promote_case(cycle_id: str, key: str, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    t = get_case(c, key)
    if t.promoted:
        raise HTTPException(409, "Already in the regression suite")
    nums = [int(i.split("-")[1]) for i in db.scalars(select(RegressionCase.id).where(RegressionCase.app_id == c.app_id)).all()]
    rid = f"REG-{max(nums + [0]) + 1}"
    suite_mod = next((m.get("suite_module") or m["id"] for m in c.app.modules if m["id"] == t.module), t.module)
    db.add(RegressionCase(id=rid, app_id=c.app_id, title=t.title, module=suite_mod, priority=t.priority,
                          preconditions=t.preconditions, steps=t.steps, expected=t.expected, source_cycle=f"PR #{c.pr_number}"))
    t.promoted, t.regression_id = True, rid
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Promoted {key} to the regression suite as {rid}", detail=t.title, category="Test cases")
    db.commit()
    return {"regression_id": rid, "case": case_out(t)}


@router.post("/cycles/{cycle_id}/suggestions/{reg_id}", status_code=201)
def include_regression(cycle_id: str, reg_id: str, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    """Adds a suggested regression case (Include related regression tests) to the cycle."""
    c = get_cycle(db, cycle_id)
    _editable(c)
    r = db.get(RegressionCase, reg_id)
    if not r or r.app_id != c.app_id:
        raise HTTPException(404, "Regression case not found")
    suite_to_id = {m.get("suite_module"): m["id"] for m in c.app.modules if m.get("suite_module")}
    cycle_mod_id = suite_to_id.get(r.module) or (c.modules[0]["id"] if c.modules else r.module)
    t = TestCase(cycle_id=c.id, key=_next_key(c), position=len(c.cases) + 1, title=r.title, type="Regression", priority=r.priority,
                 module=cycle_mod_id,
                 linked_file=r.module, source="reg", preconditions=f"{r.preconditions} Linked to {r.id}.".strip(), steps=r.steps or ["Run the regression case"],
                 expected=r.expected, promoted=True, regression_id=r.id)
    c.cases.append(t)
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Included regression case {r.id} as {t.key}", detail=r.title, category="Test cases")
    db.commit()
    return case_out(t)


class AssignIn(BaseModel):
    tester_id: str
    due: date | None = None


@router.post("/cycles/{cycle_id}/assign")
def assign(cycle_id: str, b: AssignIn, cu: CurrentUser = Depends(require(Role.senior_developer, Role.tester_lead)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    tester = db.get(User, b.tester_id)
    if not tester or tester.role not in (Role.tester, Role.tester_lead):
        raise HTTPException(422, "Pick a tester")
    if not any(t.deleted_at is None for t in c.cases):
        raise HTTPException(422, "Add at least one test case")
    tag = workflow.transition(c, CycleStatus.assigned, cu.role)
    c.tester_id, c.due = tester.id, b.due
    due = f"{b.due:%b} {b.due.day}" if b.due else "no date"
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Assigned {sum(1 for t in c.cases if t.deleted_at is None)} cases to {tester.name}, due {due}", tag=tag)
    db.commit()
    # Email / Teams notification is sent by the notifications worker (docs/12_INTEGRATIONS.md).
    return cycle_out(c)


# ---------- execution (tester) ----------

class ResultIn(BaseModel):
    status: str = Field(pattern="^(|pass|fail|blocked|na)$")
    actual: str = ""
    notes: str = ""
    bug: str = ""
    chk: list[bool] = []


@router.put("/cycles/{cycle_id}/cases/{key}/result")
def record_result(cycle_id: str, key: str, b: ResultIn, cu: CurrentUser = Depends(require(Role.tester, Role.tester_lead)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _tester_can_edit(c, cu)
    t = get_case(c, key)
    _start_testing(db, c, cu)
    changed = t.status.value != b.status
    t.status, t.actual, t.notes, t.bug, t.checked_steps = ResultStatus(b.status), b.actual, b.notes, b.bug, b.chk
    t.recorded_by_id, t.recorded_at = cu.user.id, datetime.now(timezone.utc)
    if changed and b.status:
        lbl, cls = RESULT_TAG[b.status]
        extra = (f" · {len(t.evidence)} files attached" if t.evidence else "") + (f" · linked {t.bug}" if t.bug else "")
        audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Recorded {key}{extra}", detail=b.actual, tag=lbl, tag_class=cls, category="Results")
    db.commit()
    return case_out(t)


class EvidenceIn(BaseModel):
    file_name: str
    size: int | None = None
    content_type: str = ""


@router.post("/cycles/{cycle_id}/cases/{key}/evidence", status_code=201)
def add_evidence(cycle_id: str, key: str, b: EvidenceIn, cu: CurrentUser = Depends(require(Role.tester, Role.tester_lead)), db: Session = Depends(get_db)):
    """Returns a short-lived upload URL; the browser uploads straight to Blob Storage."""
    c = get_cycle(db, cycle_id)
    _tester_can_edit(c, cu)
    t = get_case(c, key)
    blob = f"{c.app_id}/{c.id}/{t.key}/{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{b.file_name}"
    e = Evidence(case_id=t.id, file_name=b.file_name, blob_name=blob, size=b.size, content_type=b.content_type, uploaded_by_id=cu.user.id)
    db.add(e)
    db.commit()
    return {"id": e.id, "blob_name": blob, "upload_url": upload_url(blob)}


@router.delete("/cycles/{cycle_id}/cases/{key}/evidence/{evidence_id}", status_code=204)
def remove_evidence(cycle_id: str, key: str, evidence_id: str, cu: CurrentUser = Depends(require(Role.tester, Role.tester_lead)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _tester_can_edit(c, cu)
    e = db.get(Evidence, evidence_id)
    if e:
        db.delete(e)
        db.commit()


class BugIn(BaseModel):
    title: str
    repro_steps: str
    severity: str = "3 - Medium"
    area_path: str = ""


@router.post("/cycles/{cycle_id}/cases/{key}/bug", status_code=201)
def create_bug(cycle_id: str, key: str, b: BugIn, cu: CurrentUser = Depends(require(Role.tester, Role.tester_lead)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _tester_can_edit(c, cu)
    t = get_case(c, key)
    a = c.app
    bug_id = get_scm(cu, a.provider).create_bug(a.org, a.project, b.title, b.repro_steps, b.severity, b.area_path, c.pr_number)
    t.bug = bug_id
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action=f"Created bug {bug_id} for {key} in Azure DevOps", detail=b.title, category="Results")
    db.commit()
    return {"bug": bug_id}


@router.post("/cycles/{cycle_id}/submit")
def submit(cycle_id: str, cu: CurrentUser = Depends(require(Role.tester, Role.tester_lead)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    _tester_can_edit(c, cu)
    _start_testing(db, c, cu)
    missing = [t.key for t in c.cases if t.deleted_at is None and not t.status.value]
    if missing:
        raise HTTPException(422, f"{len(missing)} cases still need a status")
    tag = workflow.transition(c, CycleStatus.submitted, Role.tester)
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action="Submitted for review", tag=tag)
    db.commit()
    # If the app's validate step has a fixed provider, run it now (as the prototype does).
    mode = c.app.ai_modes.get("validate", "ask")
    if mode in ("azure", "claude"):
        run_task(db, task="validate", provider_key=mode, app=c.app, cycle=c, actor=None)
    return cycle_out(c)


# ---------- review (senior developer) ----------

@router.get("/cycles/{cycle_id}/report")
def report(cycle_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    return build_report(db, get_cycle(db, cycle_id))


class ApproveIn(BaseModel):
    note: str = ""
    accept_findings: bool = False


@router.post("/cycles/{cycle_id}/approve")
def approve(cycle_id: str, b: ApproveIn, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    r = build_report(db, c)
    if r["score"] < c.app.approve_threshold:
        raise HTTPException(409, f"Readiness {r['score']} is below this app's approval threshold of {c.app.approve_threshold}")
    if (r["observations"] or r["counts"]["fail"] or r["counts"]["blocked"]) and not b.accept_findings:
        raise HTTPException(422, "Confirm that you reviewed the observations, failures and blocked cases")
    tag = workflow.transition(c, CycleStatus.approved, cu.role)
    c.approved_note, c.approved_at, c.approved_by_id = b.note, datetime.now(timezone.utc), cu.user.id
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action="Approved for client UAT", detail=b.note, tag=tag, tag_class="p-pass", category="Approvals")
    a = c.app
    get_scm(cu, a.provider).set_pr_status(a.org, a.project, a.repo, c.pr_number, "succeeded", f"Approved for UAT · readiness {r['score']}")
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=None, actor_kind="system",
              action=f"Set the verity/uat-ready check to succeeded on PR #{c.pr_number} in Azure DevOps", category="Approvals")
    db.commit()
    return cycle_out(c)


class ChangesIn(BaseModel):
    comment: str = ""


@router.post("/cycles/{cycle_id}/request-changes")
def request_changes(cycle_id: str, b: ChangesIn, cu: CurrentUser = Depends(require(Role.senior_developer)), db: Session = Depends(get_db)):
    c = get_cycle(db, cycle_id)
    tag = workflow.transition(c, CycleStatus.changes_requested, cu.role)
    c.change_comment = b.comment.strip() or "Please review the AI findings."
    audit.log(db, cycle_id=c.id, app_id=c.app_id, actor=cu.user, action="Requested changes", detail=c.change_comment, tag=tag, tag_class="p-blk", category="Approvals")
    db.commit()
    return cycle_out(c)


@router.get("/cycles/{cycle_id}/audit")
def audit_trail(cycle_id: str, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    evs = db.scalars(select(AuditEvent).where(AuditEvent.cycle_id == cycle_id).order_by(AuditEvent.id)).all()
    users = {u.id: u for u in db.scalars(select(User)).all()}
    return [audit_out(e, users) for e in evs]


@router.get("/me/queue")
def my_queue(cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    cs = db.scalars(select(Cycle).where(Cycle.tester_id == cu.user.id).order_by(Cycle.due)).all()
    return [cycle_out(c, detail=False) | {"app_name": c.app.name, "change_comment": c.change_comment} for c in cs]
