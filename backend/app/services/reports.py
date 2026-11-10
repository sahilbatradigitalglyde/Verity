"""Builds the AI validation report for a cycle from its results and the latest validation run."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiRun, Cycle
from app.serializers import fmt_dt
from app.services.scoring import CaseView, Findings, analyze


def latest_validation(db: Session, cycle: Cycle) -> AiRun | None:
    return db.scalar(select(AiRun).where(AiRun.cycle_id == cycle.id, AiRun.task == "validate", AiRun.status == "succeeded")
                     .order_by(AiRun.created_at.desc()).limit(1))


def build_report(db: Session, cycle: Cycle) -> dict:
    run = latest_validation(db, cycle)
    f = None
    if run and run.reply:
        rp = run.reply
        f = Findings(consistency=rp["result_consistency"], gaps=rp["evidence_gaps"],
                     explain={x["case_id"]: x["explanation"] for x in rp["failures_and_blocked"]})
    cases = [CaseView(t.key, t.title, t.priority, t.module, t.status.value, t.actual, len(t.evidence), t.bug, t.expected)
             for t in cycle.cases if t.deleted_at is None]
    r = analyze(cases, cycle.modules, f)
    n_runs = len([x for x in cycle.ai_runs if x.task == "validate" and x.status == "succeeded"])
    r["ai_run"] = {"id": run.id, "provider": run.provider, "model": run.model, "at": fmt_dt(run.finished_at),
                   "summary": run.reply.get("summary", "")} if run else None
    r["ai_runs"] = n_runs
    r["advisory"] = ("This review is advisory. Verity checks coverage, consistency and evidence against the diff and the test records. "
                     "It does not re-run tests. The approval decision is yours and is recorded under your name.")
    return r
