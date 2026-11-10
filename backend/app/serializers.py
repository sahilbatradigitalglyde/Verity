"""Model → JSON shapes used by the API. Field names match what the React screens render."""
from datetime import datetime, timezone

from app.models import App, AuditEvent, Cycle, RegressionCase, TestCase, User


def fmt_dt(dt: datetime | None) -> str | None:
    """Return datetime as ISO-8601 UTC with Z suffix. Treats naive datetimes as UTC (SQLite)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace('+00:00', 'Z')


def user_out(u: User | None) -> dict | None:
    return u and {"id": u.id, "name": u.name, "initials": u.initials, "email": u.email, "role": u.role.value}


def case_out(t: TestCase) -> dict:
    return {
        "id": t.key, "uid": t.id, "version": t.version, "title": t.title, "type": t.type, "pri": t.priority,
        "file": t.linked_file, "src": t.source, "mod": t.module, "pre": t.preconditions, "steps": t.steps,
        "exp": t.expected, "edited": t.edited, "promoted": t.promoted, "regression_id": t.regression_id,
        "r": {"status": t.status.value, "actual": t.actual, "notes": t.notes, "bug": t.bug, "chk": t.checked_steps,
              "ev": [{"id": e.id, "name": e.file_name, "size": e.size} for e in t.evidence]},
    }


def cycle_out(c: Cycle, detail: bool = True) -> dict:
    cs = [t for t in c.cases if t.deleted_at is None]
    d = {
        "id": c.id, "app_id": c.app_id, "version": c.version, "name": c.name, "kind": c.kind,
        "pr_number": c.pr_number, "pr_numbers": c.pr_numbers or ([c.pr_number] if c.pr_number else []), "pr_title": c.pr_title,
        "source_branch": c.source_branch, "target_branch": c.target_branch, "authors": c.authors,
        "status": c.status.value, "tester": user_out(c.tester), "due": c.due.isoformat() if c.due else None,
        "commit_count": len(c.commits), "file_count": len(c.files), "case_count": len(cs),
        "progress": {k: sum(t.status.value == k for t in cs) for k in ("pass", "fail", "blocked", "na")},
        "updated_at": fmt_dt(c.updated_at),
    }
    if detail:
        d.update({
            "summary": c.summary, "modules": c.modules, "suggestions": c.suggestions, "commits": c.commits, "files": c.files,
            "work_items": c.work_items, "cases": [case_out(t) for t in cs], "change_comment": c.change_comment,
            "approved_note": c.approved_note, "approved_at": fmt_dt(c.approved_at),
            "ai_runs": [{"id": r.id, "task": r.task, "provider": r.provider, "model": r.model, "status": r.status,
                         "at": fmt_dt(r.finished_at)} for r in c.ai_runs],
        })
    return d


def app_out(a: App, **stats) -> dict:
    return {"id": a.id, "name": a.name, "ini": a.initials, "provider": a.provider, "path": a.path, "org": a.org, "project": a.project,
            "repo": a.repo, "target_branch": a.target_branch, "default_tester_id": a.default_tester_id,
            "approve_threshold": a.approve_threshold, "ai_modes": a.ai_modes,
            "ai_inputs": a.ai_inputs, "modules": a.modules or [], **stats}


def regression_out(r: RegressionCase) -> dict:
    return {"id": r.id, "title": r.title, "mod": r.module, "pri": r.priority, "last": r.last_run, "res": r.last_result,
            "hist": r.history, "src": r.source_cycle, "tags": r.tags, "dup": r.duplicate_of, "dupWhy": r.duplicate_reason}


def audit_out(e: AuditEvent, users: dict[str, User]) -> dict:
    u = users.get(e.actor_id) if e.actor_id else None
    who = {"name": u.name, "initials": u.initials} if u else ({"name": "Verity AI", "initials": "AI"} if e.actor_kind == "ai" else {"name": "Verity", "initials": "VY"})
    return {"id": e.id, "who": who, "action": e.action, "detail": e.detail, "tag": e.tag, "tag_class": e.tag_class,
            "category": e.category, "at": fmt_dt(e.created_at)}
