"""Deterministic provider used when AI_MODE=demo and in tests. Returns the prototype's sample replies,
built from the context Verity actually sends, so the whole workflow can be exercised without network access."""
from __future__ import annotations

import json
import re

from app.ai.providers.base import Message, ProviderResult
from app.seed_data import AIX, MODS, SUGG, TPL


class DemoProvider:
    def __init__(self, key: str = "azure"):
        self.key = key

    def complete_json(self, *, system: str, messages: list[Message], schema: dict, schema_name: str) -> ProviderResult:
        prompt = messages[0].content
        run_id = re.search(r"- run_id: (\S+)", prompt).group(1)
        task_key = re.search(r"- task: (\S+)", prompt).group(1)
        base = {"run_id": run_id, "task": task_key, "schema_version": "1.0"}
        if task_key in ("generate_test_cases", "regenerate_test_cases"):
            data = {**base,
                    "change_summary": "Adjusters can now refund part of a settled claim instead of reversing the whole settlement. Refunds are stored in a new ledger, validated against the remaining balance, blocked on closed claims, and sent to Billing as an event. The settlement summary shows refunded and remaining amounts.",
                    "modules": [{"id": m["id"], "name": m["name"], "risk": m["risk"], "description": m["desc"]} for m in MODS],
                    "test_cases": [{"title": t["title"], "type": t["type"], "priority": t["pri"], "module": t["mod"], "linked_file": t["file"],
                                    "source": t["src"], "preconditions": t["pre"], "steps": t["steps"], "expected_result": t["exp"]} for t in TPL],
                    "regression_suggestions": [{"regression_id": s["reg"], "reason": s["reason"]} for s in SUGG]}
        elif task_key == "validate_results":
            cases = _parse_cases(prompt)
            data = {**base, "summary": "High-risk changed areas were tested. Review the observations and the failed and blocked cases before approving.",
                    "result_consistency": [{"case_id": c["id"], "reason": "The actual result describes behavior the expected result does not allow for, even if it settled later. A client user could see it. Confirm whether this is acceptable or should be a Fail."}
                                           for c in cases if c["result"] == "Pass" and re.search(r"moment|briefly|flicker|timeout|intermittent|but ", c["actual"], re.I)],
                    "evidence_gaps": [{"case_id": c["id"], "reason": f"Marked Pass with no screenshot or log on a P1 case in module {c['module']}."}
                                      for c in cases if c["result"] == "Pass" and c["priority"] == "P1" and c["evidence"] == "none"],
                    "failures_and_blocked": [{"case_id": c["id"], "explanation": AIX.get(c["title_key"], "The case did not pass in an area this change touched. Check the cause before approving.")}
                                             for c in cases if c["result"] in ("Fail", "Blocked")]}
        elif task_key == "draft_bug":
            title = re.search(r"Title: (.+)", prompt).group(1)
            data = {**base, "title": f"Failed: {title}"[:90], "severity": "3 - Medium", "area_path": "Claims\\Settlement",
                    "repro_steps": prompt.split("### Failed case", 1)[-1].strip()[:2000]}
        else:
            ids = set(re.findall(r"\| (REG-\d+) \|", prompt))
            pairs = [p for p in [("REG-118", "REG-131", "Both settle a claim for the full amount end to end and check the same outcome."),
                                 ("REG-201", "REG-209", "Both check that an adjuster cannot edit a closed claim.")] if p[0] in ids and p[1] in ids]
            data = {**base, "pairs": [{"a": a, "b": b, "reason": r} for a, b, r in pairs]}
        return ProviderResult(data=data, raw=json.dumps(data), model="demo")


def _parse_cases(prompt: str) -> list[dict]:
    out = []
    for block in prompt.split("#### ")[1:]:
        head = block.splitlines()[0]
        cid, pri, _type, mod = [x.strip() for x in head.split(" · ")]
        get = lambda k: (re.search(rf"^{k}: (.*)$", block, re.M) or [None, ""])[1]
        title = get("Title")
        out.append({"id": cid, "priority": pri, "module": mod.replace("module ", ""), "result": get("Result"),
                    "actual": get("Actual"), "evidence": get("Evidence"), "title_key": next((t["id"] for t in TPL if t["title"] == title), cid)})
    return out
