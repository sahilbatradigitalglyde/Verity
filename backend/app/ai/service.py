"""Runs an AI step end to end, the same way for both providers:

1. build the prompt from the cycle (same template for Azure OpenAI and Claude)
2. call the provider, forcing a single JSON object in the reply format
3. check it: schema, run_id/task echo, and that every module / case / regression id exists
4. on failure, retry once with the errors fed back; then give up with a readable error
5. store the AiRun (prompt, reply, provider, model, tokens, who) and apply the result to the cycle
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai import prompts
from app.ai.providers import ProviderNotConfigured, get_provider
from app.ai.providers.base import Message
from app.ai.schemas import REPLY_MODEL, TASK_KEYS, TASK_NAMES, BugReply, DupsReply, GenerateReply, ValidateReply
from app.models import AiRun, App, Cycle, CycleStatus, RegressionCase, ResultStatus, TestCase, User
from app.services import audit, workflow

PROVIDER_LABEL = {"azure": "Azure OpenAI", "claude": "Claude"}
RESULT_LABEL = {"pass": "Pass", "fail": "Fail", "blocked": "Blocked", "na": "Not Applicable", "": "Not run"}


def _run_id(db: Session, app: App, cycle: Cycle | None, task: str) -> str:
    n = db.scalar(select(func.count()).select_from(AiRun).where(AiRun.app_id == app.id)) or 0
    scope = str(cycle.pr_number) if cycle and cycle.pr_number else app.initials
    return f"VR-{scope}-{task.upper()}-{n + 1:03d}"


# ---------- context builders (what the model sees) ----------

def _context(db: Session, task: str, app: App, cycle: Cycle | None, extra: dict) -> list[str]:
    L: list[str] = []
    if task in ("gen", "regen"):
        if cycle.kind == "release":
            pr_nums = cycle.pr_numbers or ([cycle.pr_number] if cycle.pr_number else [])
            L += ["### Release cycle (multiple PRs)", f"PRs: {', '.join(f'#{n}' for n in pr_nums)}",
                  f"Authors: {', '.join(cycle.authors)} · Target branch: {cycle.target_branch}", ""]
        else:
            L += ["### Pull request", f"PR #{cycle.pr_number}: {cycle.pr_title}",
                  f"Authors: {', '.join(cycle.authors)} · Branch {cycle.source_branch} → {cycle.target_branch}", ""]
        L += ["### Linked work items"]
        L += [f"- {k} {v}" for k, v in extra.get("work_item_criteria", {}).items()] or ["- none"]
        L += ["", "### Commits in this cycle"]
        for c in cycle.commits:
            L.append(f"- {c['hash']} {c['message']} ({c['author']}, {c['files']} files)")
            L.append(f"  AI commit note: {c['ai_note'] or 'none'}")
        L += ["", "### Changed files", "| Status | File | Added | Removed |", "|---|---|---|---|"]
        L += [f"| {'Added' if f['status'] == 'A' else 'Modified'} | {f['path']} | {f['added']} | {f['removed']} |" for f in cycle.files]
        if extra.get("diffs"):
            L += ["", "### Diffs", *extra["diffs"]]
        L += ["", "### Existing regression suite (candidates)"]
        regs = db.scalars(select(RegressionCase).where(RegressionCase.app_id == app.id, RegressionCase.archived.is_(False))).all()
        L += [f"- {r.id} {r.title} ({r.module}, {r.priority}, last result {r.last_result})" for r in regs]
        if app.modules:
            L += ["", "### Established module vocabulary (use these IDs to stay consistent across cycles)"]
            L += [f"- {m['id']}: {m['name']} ({m['risk']} risk)" for m in app.modules]
        if task == "regen":
            L += ["", "### Current cases (Verity keeps the edited and manual ones)"]
            L += [f"- {t.key} {t.title}{' [edited by reviewer]' if t.edited else ' [added manually]' if t.source == 'manual' else ''}" for t in cycle.cases if t.deleted_at is None]
    elif task == "validate":
        L += ["### Pull request", f"PR #{cycle.pr_number}: {cycle.pr_title}", "", "### Modules and risk"]
        L += [f"- {m['id']}: {m['name']} ({m['risk']} risk). {m.get('desc', '')}" for m in cycle.modules]
        L += ["", "### Commits"] + [f"- {c['hash']} {c['message']}" + (f" · AI note: {c['ai_note']}" if c["ai_note"] else " · no AI note") for c in cycle.commits]
        L += ["", "### Test cases and results"]
        for t in cycle.cases:
            if t.deleted_at is not None:
                continue
            L += ["", f"#### {t.key} · {t.priority} · {t.type} · module {t.module}", f"Title: {t.title}", f"Preconditions: {t.preconditions}", "Steps:"]
            L += [f"  {i + 1}. {s}" for i, s in enumerate(t.steps)]
            L += [f"Expected: {t.expected}", f"Result: {RESULT_LABEL[t.status.value]}", f"Actual: {t.actual or '(empty)'}",
                  f"Notes: {t.notes or '(none)'}", f"Evidence: {', '.join(e.file_name for e in t.evidence) or 'none'}", f"Linked bug: {t.bug or 'none'}"]
    elif task == "bug":
        t: TestCase = extra["case"]
        L += [f"### Failed case {t.key}", f"Title: {t.title}", f"Priority: {t.priority} · Module: {t.module} · File: {t.linked_file}",
              f"Preconditions: {t.preconditions}", "Steps:"]
        L += [f"  {i + 1}. {s}" for i, s in enumerate(t.steps)]
        L += [f"Expected: {t.expected}", f"Actual: {t.actual or '(not entered)'}", f"Tester notes: {t.notes or '(none)'}",
              f"Evidence: {', '.join(e.file_name for e in t.evidence) or 'none'}", "", f"Pull request: PR #{cycle.pr_number}, branch {cycle.source_branch}"]
    else:
        L += [f"### Regression suite: {app.name}", "| ID | Title | Module | Priority | Last result | Source |", "|---|---|---|---|---|---|"]
        regs = db.scalars(select(RegressionCase).where(RegressionCase.app_id == app.id, RegressionCase.archived.is_(False))).all()
        L += [f"| {r.id} | {r.title} | {r.module} | {r.priority} | {r.last_result} | {r.source_cycle} |" for r in regs]
    return L


# ---------- checks beyond the JSON schema ----------

def _check(db: Session, task: str, run_id: str, app: App, cycle: Cycle | None, data: dict | None):
    if data is None:
        return None, ["The reply was not a JSON object."]
    try:
        o = REPLY_MODEL[task].model_validate(data)
    except ValidationError as e:
        return None, [f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}" for err in e.errors()][:8]
    errs: list[str] = []
    if o.run_id != run_id:
        errs.append(f'run_id is "{o.run_id}" but this run is {run_id}.')
    if o.task != TASK_KEYS[task]:
        errs.append(f'task is "{o.task}" but should be {TASK_KEYS[task]}.')
    if isinstance(o, GenerateReply):
        mod_ids = {m.id for m in o.modules}
        errs += [f'test_cases[{i}].module "{t.module}" is not one of the modules.' for i, t in enumerate(o.test_cases) if t.module not in mod_ids]
    if isinstance(o, ValidateReply):
        keys = {t.key for t in cycle.cases if t.deleted_at is None}
        for name in ("result_consistency", "evidence_gaps", "failures_and_blocked"):
            errs += [f'{name}[{i}].case_id "{x.case_id}" is not a case in this cycle.' for i, x in enumerate(getattr(o, name)) if x.case_id not in keys]
    if isinstance(o, DupsReply):
        ids = set(db.scalars(select(RegressionCase.id).where(RegressionCase.app_id == app.id)).all())
        errs += [f"pairs[{i}] refers to {x}, which is not in the suite." for i, p in enumerate(o.pairs) for x in (p.a, p.b) if x not in ids]
    return (o if not errs else None), errs[:8]


# ---------- main entry ----------

def run_task(db: Session, *, task: str, provider_key: str, app: App, cycle: Cycle | None, actor: User | None,
             extra: dict | None = None, apply: bool = True) -> tuple[AiRun, object]:
    extra = extra or {}
    try:
        provider = get_provider(provider_key)
    except ProviderNotConfigured as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from e

    run_id = _run_id(db, app, cycle, task)
    system = prompts.system_prompt(task)
    user = prompts.user_prompt(task, run_id, f"{app.name} ({app.path})", _context(db, task, app, cycle, extra))
    run = AiRun(id=run_id, cycle_id=cycle.id if cycle else None, app_id=app.id, task=task, provider=provider_key,
                prompt=system + "\n\n" + user, started_by_id=actor.id if actor else None)
    db.add(run)
    db.flush()

    messages = [Message("user", user)]
    schema = prompts.json_schema(task)
    parsed, errors, attempts = None, [], 0
    for attempts in (1, 2):
        try:
            res = provider.complete_json(system=system, messages=messages, schema=schema, schema_name=TASK_KEYS[task])
        except Exception as e:  # network / auth / rate limit
            run.status, run.errors, run.finished_at = "failed", [str(e)], datetime.now(timezone.utc)
            db.commit()
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"{PROVIDER_LABEL[provider_key]} call failed: {e}") from e
        run.model, run.raw_reply = res.model, res.raw
        run.input_tokens = (run.input_tokens or 0) + (res.input_tokens or 0)
        run.output_tokens = (run.output_tokens or 0) + (res.output_tokens or 0)
        parsed, errors = _check(db, task, run_id, app, cycle, res.data)
        if parsed:
            break
        messages += [Message("assistant", res.raw or "{}"), Message("user", prompts.retry_prompt(errors))]

    run.attempts, run.errors, run.finished_at = attempts, errors, datetime.now(timezone.utc)
    if not parsed:
        run.status = "failed"
        db.commit()
        raise HTTPException(422, {"message": "Not imported. The AI reply did not match the format.", "errors": errors, "run_id": run_id})
    run.status, run.reply = "succeeded", parsed.model_dump()
    if apply:
        APPLY[task](db, run, parsed, app, cycle, actor)
    db.commit()
    return run, parsed


# ---------- apply results (mirrors the frontend store's APPLY) ----------

def _cases_from(cycle: Cycle, o: GenerateReply, start: int = 1) -> list[TestCase]:
    return [TestCase(cycle_id=cycle.id, key=f"TC-{i:02d}", position=i, title=t.title, type=t.type, priority=t.priority,
                     linked_file=t.linked_file, source=t.source, module=t.module, preconditions=t.preconditions,
                     steps=list(t.steps), expected=t.expected_result)
            for i, t in enumerate(o.test_cases, start)]


def _prov(run: AiRun) -> str:
    return f"{PROVIDER_LABEL[run.provider]} · run {run.id}"


def _apply_gen(db, run, o: GenerateReply, app, cycle: Cycle, actor):
    for t in list(cycle.cases):
        db.delete(t)
    db.flush()
    cycle.cases = _cases_from(cycle, o)
    cycle.modules = [{"id": m.id, "name": m.name, "risk": m.risk, "desc": m.description} for m in o.modules]
    cycle.summary = o.change_summary
    cycle.suggestions = [s.model_dump() for s in o.regression_suggestions]
    # Seed the app's module vocabulary from the first gen run
    if not app.modules:
        app.modules = list(cycle.modules)
    tag = workflow.transition(cycle, CycleStatus.tests_generated, actor.role if actor else "system")
    audit.log(db, cycle_id=cycle.id, app_id=app.id, actor=None, actor_kind="ai", action=f"Generated {len(o.test_cases)} test cases",
              detail=_prov(run), tag=tag, category="AI runs")


def _apply_regen(db, run, o: GenerateReply, app, cycle: Cycle, actor):
    keep = [t for t in cycle.cases if t.deleted_at is None and (t.edited or t.source in ("manual", "reg"))]
    keep_keys = {t.key for t in keep}
    for t in [t for t in cycle.cases if t.key not in keep_keys]:
        cycle.cases.remove(t)
        db.delete(t)
    db.flush()
    fresh = [t for t in _cases_from(cycle, o) if t.key not in keep_keys]
    for t in fresh:
        cycle.cases.append(t)
    for i, t in enumerate(sorted(cycle.cases, key=lambda x: x.key), 1):
        t.position = i
    cycle.modules = [{"id": m.id, "name": m.name, "risk": m.risk, "desc": m.description} for m in o.modules]
    cycle.summary = o.change_summary
    cycle.suggestions = [s.model_dump() for s in o.regression_suggestions]
    audit.log(db, cycle_id=cycle.id, app_id=app.id, actor=None, actor_kind="ai", action=f"Regenerated test cases: {len(cycle.cases)} in total",
              detail=f"{len(keep)} edited or added cases kept · {_prov(run)}", tag=PROVIDER_LABEL[run.provider], category="AI runs")


def _apply_validate(db, run, o: ValidateReply, app, cycle: Cycle, actor):
    from app.services.reports import build_report  # local import avoids a cycle
    first = cycle.status == CycleStatus.submitted
    tag = workflow.transition(cycle, CycleStatus.ai_reviewed, "system") if first else ""
    db.flush()
    r = build_report(db, cycle)
    audit.log(db, cycle_id=cycle.id, app_id=app.id, actor=None, actor_kind="ai",
              action=f"{'Ran' if first else 'Re-ran'} validation: readiness {r['score']} / 100",
              detail=f"{r['observations']} observations, {r['counts']['fail']} failures, {r['counts']['blocked']} blocked · {_prov(run)}",
              tag=tag or PROVIDER_LABEL[run.provider], category="AI runs")


def _apply_bug(db, run, o: BugReply, app, cycle, actor):
    audit.log(db, cycle_id=cycle.id, app_id=app.id, actor=None, actor_kind="ai", action="Drafted a bug", detail=_prov(run), category="Results")


def _apply_dups(db, run, o: DupsReply, app, cycle, actor):
    regs = {r.id: r for r in db.scalars(select(RegressionCase).where(RegressionCase.app_id == app.id)).all()}
    for r in regs.values():
        r.duplicate_of, r.duplicate_reason = "", ""
    for p in o.pairs:
        regs[p.a].duplicate_of, regs[p.a].duplicate_reason = p.b, p.reason
        regs[p.b].duplicate_of, regs[p.b].duplicate_reason = p.a, p.reason


APPLY = {"gen": _apply_gen, "regen": _apply_regen, "validate": _apply_validate, "bug": _apply_bug, "dups": _apply_dups}

__all__ = ["run_task", "TASK_NAMES", "ResultStatus"]
