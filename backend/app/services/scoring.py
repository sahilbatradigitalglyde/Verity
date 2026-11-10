"""Readiness score. Calculated by Verity from the test results and the AI findings — never by the AI —
so Azure OpenAI and Claude runs are scored identically. Same formula as frontend/src/lib/analyze.ts.

score = 100 − 8·fail − 6·blocked − 2·observations − 10·(high-risk modules not verified) − 2·N/A, clamped 0–100
"""
from __future__ import annotations

from dataclasses import dataclass, field


def plural(n: int, w: str) -> str:
    return f"{n} {w}{'' if n == 1 else 's'}"


@dataclass
class CaseView:
    id: str
    title: str
    priority: str
    module: str
    status: str  # "" | pass | fail | blocked | na
    actual: str = ""
    evidence_count: int = 0
    bug: str = ""
    expected: str = ""


@dataclass
class Findings:
    consistency: list[dict] = field(default_factory=list)  # [{case_id, reason}]
    gaps: list[dict] = field(default_factory=list)
    explain: dict[str, str] = field(default_factory=dict)


def analyze(cases: list[CaseView], modules: list[dict], ai: Findings | None) -> dict:
    cnt = {"pass": 0, "fail": 0, "blocked": 0, "na": 0, "none": 0}
    for c in cases:
        cnt[c.status or "none"] += 1
    ids = {c.id for c in cases}
    consistency = [f for f in (ai.consistency if ai else []) if f["case_id"] in ids]
    gaps = [f for f in (ai.gaps if ai else []) if f["case_id"] in ids]
    issues = [c for c in cases if c.status in ("fail", "blocked")]

    mods = []
    for m in modules:
        mc = [c for c in cases if c.module == m["id"]]
        p = sum(c.status == "pass" for c in mc)
        f = sum(c.status == "fail" for c in mc)
        b = sum(c.status in ("blocked", "na") for c in mc)
        mods.append({**m, "case_ids": [c.id for c in mc], "total": len(mc), "passed": p, "failed": f, "blocked": b,
                     "verified": len(mc) > 0 and p + f == len(mc)})

    high_unverified = sum(1 for m in mods if m["risk"] == "High" and not m["verified"])
    obs = len(consistency) + len(gaps)
    score = 100 - 8 * cnt["fail"] - 6 * cnt["blocked"] - 2 * obs - 10 * high_unverified - 2 * cnt["na"]
    score = max(0, min(100, score))

    p1_fail = any(c.status == "fail" and c.priority == "P1" for c in issues)
    if p1_fail:
        verdict = "Not ready: a P1 case failed"
    elif score >= 80:
        verdict = f"Ready for UAT with {plural(obs, 'observation')}" if obs else "Ready for UAT"
    elif score >= 65:
        verdict = "Needs attention before UAT"
    else:
        verdict = "Not ready for UAT"

    verified = sum(m["verified"] for m in mods)
    high_ok = all(m["verified"] for m in mods if m["risk"] == "High")
    summary = "High-risk changed areas are fully tested." if high_ok else "At least one high-risk area is not fully verified."
    if cnt["fail"]:
        summary += f" {plural(cnt['fail'], 'case')} failed{' with a bug logged' if any(c.bug for c in issues) else ''}."
    if cnt["blocked"]:
        summary += f" {plural(cnt['blocked'], 'case')} could not run, so {'that area is' if cnt['blocked'] == 1 else 'those areas are'} unverified."
    if not cnt["fail"] and not cnt["blocked"]:
        summary += " Every case ran."

    p1_pass = [c for c in cases if c.status == "pass" and c.priority == "P1"]
    parts = [
        ("Coverage of changed areas", round(100 * verified / len(mods)) if mods else 100),
        ("Result consistency", max(0, 100 - 14 * len(consistency))),
        ("Evidence on high-priority cases", round(100 * sum(c.evidence_count > 0 for c in p1_pass) / len(p1_pass)) if p1_pass else 100),
        ("Outcomes", round(100 * cnt["pass"] / len(cases)) if cases else 0),
    ]
    return {
        "counts": cnt, "score": score, "verdict": verdict, "summary": summary, "observations": obs,
        "modules": mods, "verified_modules": verified,
        "consistency": consistency, "evidence_gaps": gaps,
        "issues": [{"case_id": c.id, "status": c.status, "explanation": (ai.explain.get(c.id, "") if ai else "")} for c in issues],
        "parts": [{"label": l, "value": v} for l, v in parts],
    }
