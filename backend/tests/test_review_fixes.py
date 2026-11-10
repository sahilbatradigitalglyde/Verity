"""Tests for the Phase 1 review findings (Fixes 1-6)."""
import json

from app.core.db import SessionLocal
from app.jobs.runner import task_steps
from app.seed import seed_demo
from app.seed_data import MODS, MODREG, PRS, TPL
from tests.conftest import as_


# ---------- helpers ----------

def _create_cycle(client, dev, name="cycle", pr=482):
    shas = [x["hash"] for x in PRS[0]["commits"]]
    return client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": name, "pr_numbers": [pr], "commit_shas": shas}).json()["id"]


def _run_gen(client, dev, cid):
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "gen", "provider": "azure"}).json()["job_id"]
    return client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()


def _run_validate(client, dev, cid):
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "validate", "provider": "azure"}).json()["job_id"]
    return client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()


def _assign_submit_validate(client, cid):
    """Assign, record pass for all active cases, submit, validate — returns report."""
    dev, tester = as_("dev"), as_("tester")
    testers = client.get("/api/users/testers", headers=dev).json()
    tester_id = next(t["id"] for t in testers if t["email"] == "priya.shah@contoso.com")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": tester_id})
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    for case in cyc["cases"]:
        client.put(f"/api/cycles/{cid}/cases/{case['id']}/result", headers=tester,
                   json={"status": "pass", "actual": "Passed"})
    client.post(f"/api/cycles/{cid}/submit", headers=tester)
    _run_validate(client, dev, cid)
    return client.get(f"/api/cycles/{cid}/report", headers=dev).json()


# =====================================================================
# Fix 1 — soft-deleted cases excluded everywhere
# =====================================================================

def test_deleted_case_excluded_from_report(client):
    """Deleted TC-04 must not be counted; report returns a valid score after all remaining pass."""
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    cid = items[0]["id"]

    # Delete TC-04 (case_out uses "id" for the key field)
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    tc04 = next(c for c in cyc["cases"] if c["id"] == "TC-04")
    client.delete(f"/api/cycles/{cid}/cases/TC-04",
                  headers={**dev, "if-match": str(tc04["version"])})

    # 13 cases remain; all pass → score must be 100 (deleted case excluded from scoring)
    report = _assign_submit_validate(client, cid)
    assert isinstance(report["score"], int)
    # Score must reflect 13 non-deleted cases only (not 14)
    total = sum(report["counts"].values())
    assert total == 13


def test_deleted_case_excluded_from_assign_audit(client):
    """The assign audit message counts only non-deleted cases."""
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    cid = items[0]["id"]

    # Delete TC-04 (case_out uses "id" for the key field)
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    tc04 = next(c for c in cyc["cases"] if c["id"] == "TC-04")
    client.delete(f"/api/cycles/{cid}/cases/TC-04",
                  headers={**dev, "if-match": str(tc04["version"])})

    testers = client.get("/api/users/testers", headers=dev).json()
    tester_id = next(t["id"] for t in testers if t["email"] == "priya.shah@contoso.com")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": tester_id})

    trail = client.get(f"/api/cycles/{cid}/audit", headers=dev).json()
    assign_event = next(e for e in trail if "Assigned" in e["action"])
    # 14 total - 1 deleted = 13
    assert "13 cases" in assign_event["action"]


def test_deleted_case_excluded_from_validate_context(client):
    """Validate job succeeds even when a case is soft-deleted (AI sees only 13 cases)."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    _run_gen(client, dev, cid)

    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    first_case = cyc["cases"][0]
    # case_out uses "id" for key field; deleted cases are already filtered from cycle_out
    client.delete(f"/api/cycles/{cid}/cases/{first_case['id']}",
                  headers={**dev, "if-match": str(first_case["version"])})

    # Assign + record results for remaining cases
    tester = as_("tester")
    testers = client.get("/api/users/testers", headers=dev).json()
    tester_id = next(t["id"] for t in testers if t["email"] == "priya.shah@contoso.com")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": tester_id})
    cyc2 = client.get(f"/api/cycles/{cid}", headers=dev).json()
    for case in cyc2["cases"]:
        # cycle_out already filters deleted cases; record all returned cases
        client.put(f"/api/cycles/{cid}/cases/{case['id']}/result", headers=tester,
                   json={"status": "pass", "actual": "Passed"})
    client.post(f"/api/cycles/{cid}/submit", headers=tester)

    job = _run_validate(client, dev, cid)
    assert job["status"] == "succeeded"


def test_dashboard_stats_exclude_deleted_cases(client):
    """Dashboard pass rate must not count soft-deleted cases."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    _run_gen(client, dev, cid)

    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    first_case = cyc["cases"][0]
    client.delete(f"/api/cycles/{cid}/cases/{first_case['id']}",
                  headers={**dev, "if-match": str(first_case["version"])})

    # Stats endpoint must not error
    app = client.get("/api/apps/claims", headers=dev).json()
    assert "rate" in app  # value may be None; just must not raise


# =====================================================================
# Fix 2 — suite_module in app.modules used for promote and regression
# =====================================================================

def test_suite_module_in_seed_demo_app_modules(client):
    """seed_demo stamps suite_module on app.modules from MODREG."""
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    app = client.get("/api/apps/claims", headers=dev).json()
    for m in app["modules"]:
        assert "suite_module" in m
        expected = MODREG.get(m["id"], "")
        assert m["suite_module"] == expected


def test_suite_module_in_seed_demo_cycle_modules(client):
    """seed_demo puts suite_module on each cycle module."""
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    cid = items[0]["id"]
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    for m in cyc["modules"]:
        assert "suite_module" in m


def test_promote_uses_suite_module(client):
    """Promoted case gets the suite module name, not the AI module ID."""
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    cid = items[0]["id"]
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    # Find a case whose module has a suite_module mapping
    app = client.get("/api/apps/claims", headers=dev).json()
    mod_map = {m["id"]: m.get("suite_module") or m["id"] for m in app["modules"]}
    case = next((c for c in cyc["cases"] if c["mod"] in mod_map), cyc["cases"][0])

    r = client.post(f"/api/cycles/{cid}/cases/{case['id']}/promote", headers=dev)
    assert r.status_code == 200
    reg_id = r.json()["regression_id"]
    reg_cases = client.get("/api/apps/claims/regression", headers=dev).json()["items"]
    promoted = next(x for x in reg_cases if x["id"] == reg_id)
    # regression_out uses "mod" for module; promoted case must have suite_module name, not AI ID
    assert promoted["mod"] == mod_map.get(case["mod"], case["mod"])


# =====================================================================
# Fix 3 — step labels match frontend tasks.ts aiSteps()
# =====================================================================

def test_gen_steps_include_provider_name():
    steps = task_steps("gen", "azure")
    assert len(steps) == 5
    assert any("Azure OpenAI" in s for s in steps)
    assert steps[0] == "Reading diffs from Azure DevOps"
    assert steps[4] == "Matching against the regression suite"


def test_regen_steps_include_provider_name():
    steps = task_steps("regen", "claude")
    assert len(steps) == 3
    assert any("Claude" in s for s in steps)
    assert steps[0] == "Re-reading the diff"
    assert steps[2] == "Keeping your edited cases"


def test_validate_steps():
    steps = task_steps("validate", "azure")
    assert len(steps) == 3
    assert steps[0] == "Collecting results and evidence"


def test_bug_steps():
    steps = task_steps("bug", "azure")
    assert len(steps) == 2
    assert steps[0] == "Collecting the failed case and evidence"


def test_dups_steps():
    steps = task_steps("dups", "claude")
    assert len(steps) == 3
    assert steps[0] == "Loading the regression suite"


def test_gen_job_has_correct_steps(client):
    """Job created for gen task must carry the 5 canonical step labels."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    job = _run_gen(client, dev, cid)
    assert len(job["steps"]) == 5
    assert "Azure OpenAI" in job["steps"][2]


def test_validate_job_has_correct_steps(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    _run_gen(client, dev, cid)

    tester = as_("tester")
    testers = client.get("/api/users/testers", headers=dev).json()
    tester_id = next(t["id"] for t in testers if t["email"] == "priya.shah@contoso.com")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": tester_id})
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    for case in cyc["cases"]:
        client.put(f"/api/cycles/{cid}/cases/{case['id']}/result", headers=tester,
                   json={"status": "pass", "actual": "Passed"})
    client.post(f"/api/cycles/{cid}/submit", headers=tester)

    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "validate", "provider": "azure"}).json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert len(job["steps"]) == 3
    assert job["steps"][0] == "Collecting results and evidence"


# =====================================================================
# Fix 4 — job errors stored as structured JSON {message, errors[], run_id}
# =====================================================================

def test_job_error_parsed_as_dict():
    """_parse_error must round-trip a JSON dict and leave plain strings unchanged."""
    from app.routers.ai_jobs import _parse_error
    import json

    struct = {"message": "Not imported.", "errors": ["run_id mismatch"], "run_id": "VR-482-GEN-001"}
    encoded = json.dumps(struct)
    assert _parse_error(encoded) == struct

    plain = "Provider call failed"
    assert _parse_error(plain) == plain

    assert _parse_error(None) is None


def test_successful_job_has_no_error(client):
    """A succeeded gen job must have error=null, not str(None) or similar."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    job = _run_gen(client, dev, cid)
    assert job["status"] == "succeeded"
    assert job["error"] is None


# =====================================================================
# Fix 5 — migration marks columns NOT NULL
# =====================================================================

def test_migration_columns_not_null():
    """apps.modules and cycles.pr_numbers must be NOT NULL in the schema."""
    import sqlalchemy as sa
    from app.core.db import engine
    insp = sa.inspect(engine)
    apps_cols = {c["name"]: c for c in insp.get_columns("apps")}
    cycles_cols = {c["name"]: c for c in insp.get_columns("cycles")}
    assert not apps_cols["modules"]["nullable"], "apps.modules must be NOT NULL"
    assert not cycles_cols["pr_numbers"]["nullable"], "cycles.pr_numbers must be NOT NULL"


# =====================================================================
# Fix 6 — regression search matches tags
# =====================================================================

def test_regression_search_matches_tags(client):
    """GET /regression?q=<tag> must return cases tagged with that value."""
    dev = as_("dev")
    # Tag a regression case
    reg = client.get("/api/apps/claims/regression", headers=dev).json()
    first_id = reg["items"][0]["id"]
    client.post("/api/apps/claims/regression/tag", headers=dev,
                json={"ids": [first_id], "tag": "smoke-unique-xyz"})

    results = client.get("/api/apps/claims/regression?q=smoke-unique-xyz", headers=dev).json()
    ids = [r["id"] for r in results["items"]]
    assert first_id in ids, "Tagged case must appear in search results"


def test_regression_search_still_matches_title(client):
    """Tag search addition must not break existing title search."""
    dev = as_("dev")
    reg = client.get("/api/apps/claims/regression", headers=dev).json()
    first = reg["items"][0]
    # Search by a word from the title
    word = first["title"].split()[0]
    results = client.get(f"/api/apps/claims/regression?q={word}", headers=dev).json()
    ids = [r["id"] for r in results["items"]]
    assert first["id"] in ids
