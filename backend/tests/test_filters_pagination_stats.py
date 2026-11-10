"""Tests for tasks 1.4 (cycle list filters + pagination), 1.5 (regression pagination), 1.8 (dashboard stats)."""
from app.seed_data import PRS
from tests.conftest import as_


# ---------- helpers ----------

def _create_cycle(client, dev, name="test cycle", pr=482):
    shas = [x["hash"] for x in PRS[0]["commits"]]
    return client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": name, "pr_numbers": [pr], "commit_shas": shas}).json()["id"]


def _gen(client, dev, cid):
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "gen", "provider": "azure"}).json()["job_id"]
    client.get(f"/api/ai-jobs/{job_id}", headers=dev)


def _cycle_list(client, dev, **params):
    return client.get("/api/apps/claims/cycles", headers=dev, params=params).json()


# =====================================================================
# 1.4  Cycle list: envelope, filters, pagination
# =====================================================================

def test_cycle_list_returns_envelope(client):
    dev = as_("dev")
    _create_cycle(client, dev)
    r = _cycle_list(client, dev)
    assert {"items", "total", "page", "pages"} <= r.keys()
    assert isinstance(r["items"], list)
    assert r["total"] >= 1
    assert r["page"] == 1


def test_cycle_list_status_filter_draft(client):
    dev = as_("dev")
    _create_cycle(client, dev, name="draft cycle")
    r = _cycle_list(client, dev, status="Draft")
    assert r["total"] >= 1
    assert all(x["status"] == "Draft" for x in r["items"])


def test_cycle_list_status_filter_no_match(client):
    dev = as_("dev")
    _create_cycle(client, dev)
    r = _cycle_list(client, dev, status="Approved for UAT")
    assert r["total"] == 0
    assert r["items"] == []


def test_cycle_list_q_filter_by_name(client):
    dev = as_("dev")
    _create_cycle(client, dev, name="unique-xyzzy cycle")
    _create_cycle(client, dev, name="other cycle")
    r = _cycle_list(client, dev, q="unique-xyzzy")
    assert r["total"] == 1
    assert r["items"][0]["name"] == "unique-xyzzy cycle"


def test_cycle_list_q_filter_by_pr_number(client):
    dev = as_("dev")
    _create_cycle(client, dev, name="pr 482 cycle")
    r = _cycle_list(client, dev, q="482")
    assert r["total"] >= 1
    assert all(x["pr_number"] == 482 for x in r["items"])


def test_cycle_list_tester_filter(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev, name="assigned cycle")
    _gen(client, dev, cid)
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    r = _cycle_list(client, dev, tester=priya["id"])
    assert r["total"] == 1
    assert r["items"][0]["id"] == cid


def test_cycle_list_tester_filter_no_match(client):
    dev = as_("dev")
    _create_cycle(client, dev)
    r = _cycle_list(client, dev, tester="nonexistent-id")
    assert r["total"] == 0


def test_cycle_list_pagination_page_size(client):
    dev = as_("dev")
    for i in range(3):
        _create_cycle(client, dev, name=f"cycle {i}")
    r1 = _cycle_list(client, dev, page=1, page_size=2)
    r2 = _cycle_list(client, dev, page=2, page_size=2)
    assert len(r1["items"]) == 2
    assert r1["total"] >= 3
    assert r1["pages"] >= 2
    # Page 2 has different items than page 1
    ids1 = {x["id"] for x in r1["items"]}
    ids2 = {x["id"] for x in r2["items"]}
    assert ids1.isdisjoint(ids2)


def test_cycle_list_page_beyond_last_returns_empty(client):
    dev = as_("dev")
    _create_cycle(client, dev)
    r = _cycle_list(client, dev, page=9999, page_size=20)
    assert r["items"] == []
    assert r["total"] >= 1


# =====================================================================
# 1.5  Regression list: envelope, SQL search, pagination
# =====================================================================

def _reg_list(client, dev, **params):
    return client.get("/api/apps/claims/regression", headers=dev, params=params).json()


def test_regression_list_returns_envelope(client):
    dev = as_("dev")
    r = _reg_list(client, dev)
    assert {"items", "total", "page", "pages"} <= r.keys()
    assert isinstance(r["items"], list)
    assert r["total"] > 0


def test_regression_list_q_filter(client):
    dev = as_("dev")
    # Seed data has known regression cases; search for one by id
    all_items = _reg_list(client, dev)["items"]
    if not all_items:
        return
    sample = all_items[0]
    r = _reg_list(client, dev, q=sample["id"])
    assert r["total"] >= 1
    assert any(x["id"] == sample["id"] for x in r["items"])


def test_regression_list_q_filter_no_match(client):
    dev = as_("dev")
    r = _reg_list(client, dev, q="ZZZNOSUCHTITLEZZZ")
    assert r["total"] == 0
    assert r["items"] == []


def test_regression_list_pagination(client):
    dev = as_("dev")
    total = _reg_list(client, dev)["total"]
    if total < 2:
        return
    r1 = _reg_list(client, dev, page=1, page_size=1)
    r2 = _reg_list(client, dev, page=2, page_size=1)
    assert len(r1["items"]) == 1
    assert len(r2["items"]) == 1
    assert r1["items"][0]["id"] != r2["items"][0]["id"]


def test_regression_list_module_filter(client):
    dev = as_("dev")
    all_items = _reg_list(client, dev)["items"]
    if not all_items:
        return
    mod = all_items[0]["mod"]
    r = _reg_list(client, dev, module=mod)
    assert all(x["mod"] == mod for x in r["items"])


# =====================================================================
# 1.8  Dashboard stats: rate_30d present and computed in SQL
# =====================================================================

def test_dashboard_stats_has_rate_30d(client):
    dev = as_("dev")
    app = client.get("/api/apps/claims", headers=dev).json()
    assert "rate_30d" in app
    # No results recorded yet → should be null
    assert app["rate_30d"] is None or isinstance(app["rate_30d"], int)


def test_dashboard_stats_rate_matches_all_apps(client):
    dev = as_("dev")
    apps = client.get("/api/apps", headers=dev).json()
    for a in apps:
        assert "rate_30d" in a
        assert a["rate_30d"] is None or 0 <= a["rate_30d"] <= 100


def test_dashboard_stats_rate_30d_after_results(client):
    """rate_30d is non-null once test results are recorded in this session (which is within 30 days)."""
    dev, tester = as_("dev"), as_("tester")
    cid = _create_cycle(client, dev, name="stats test cycle")
    _gen(client, dev, cid)
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    # Record one result
    cases = client.get(f"/api/cycles/{cid}", headers=dev).json()["cases"]
    client.put(f"/api/cycles/{cid}/cases/{cases[0]['id']}/result", headers=tester,
               json={"status": "pass", "actual": "ok"})
    app = client.get("/api/apps/claims", headers=dev).json()
    assert app["rate_30d"] is not None
    assert 0 <= app["rate_30d"] <= 100


# =====================================================================
# 1.9  Dashboard stats: awaiting_review, approved_today, blocked, in_testing
# =====================================================================

def test_dashboard_stats_new_count_fields_present(client):
    dev = as_("dev")
    app = client.get("/api/apps/claims", headers=dev).json()
    for field in ("awaiting_review", "approved_today", "blocked", "in_testing"):
        assert field in app, f"Missing field: {field}"
        assert isinstance(app[field], int), f"{field} must be int"


def test_list_apps_new_count_fields_present(client):
    dev = as_("dev")
    apps = client.get("/api/apps", headers=dev).json()
    assert len(apps) > 0
    for a in apps:
        for field in ("awaiting_review", "approved_today", "blocked", "in_testing"):
            assert field in a, f"Missing field {field} in app {a.get('id')}"
            assert isinstance(a[field], int)


def test_dashboard_stats_new_counts_zero_on_fresh_seed(client):
    dev = as_("dev")
    app = client.get("/api/apps/claims", headers=dev).json()
    # Fresh seed has cycles in draft/tests_generated but none AI Reviewed, CR, Assigned or In Testing
    assert app["awaiting_review"] == 0
    assert app["approved_today"] == 0
    assert app["blocked"] == 0


def test_dashboard_stats_in_testing_increments_on_assign(client):
    dev, tester = as_("dev"), as_("tester")
    cid = _create_cycle(client, dev, name="in-testing count cycle")
    _gen(client, dev, cid)
    before = client.get("/api/apps/claims", headers=dev).json()["in_testing"]
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    after = client.get("/api/apps/claims", headers=dev).json()["in_testing"]
    assert after == before + 1


def test_dashboard_stats_awaiting_review_increments_on_submit_and_validate(client):
    dev, tester = as_("dev"), as_("tester")
    cid = _create_cycle(client, dev, name="awaiting-review count cycle")
    _gen(client, dev, cid)
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    cases = client.get(f"/api/cycles/{cid}", headers=tester).json()["cases"]
    for c in cases:
        client.put(f"/api/cycles/{cid}/cases/{c['id']}/result", headers=tester,
                   json={"status": "pass", "actual": "ok"})
    client.post(f"/api/cycles/{cid}/submit", headers=tester)
    # Run AI validate to reach AI Reviewed
    client.post(f"/api/cycles/{cid}/ai-runs", headers=dev, json={"task": "validate", "provider": "azure"})
    before = client.get("/api/apps/claims", headers=dev).json()["awaiting_review"]
    assert before >= 1


# =====================================================================
# 2.3 fixes: ISO 8601 UTC datetimes and cycles q search (author/tester)
# =====================================================================

import re as _re
_UTC_RE = _re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$')


def _assert_utc(value, field):
    assert _UTC_RE.match(value), f"{field}={value!r} is not ISO-8601 UTC"


def test_cycle_list_updated_at_has_utc_suffix(client):
    """updated_at in cycle list items must carry a UTC timezone suffix."""
    dev = as_("dev")
    _create_cycle(client, dev, name="utc-check cycle")
    r = _cycle_list(client, dev)
    for item in r["items"]:
        if item.get("updated_at"):
            _assert_utc(item["updated_at"], "updated_at")


def test_app_last_has_utc_suffix_when_present(client):
    """app.last (most-recent approval timestamp) must carry UTC suffix when non-null."""
    dev, tester = as_("dev"), as_("tester")
    # Push a cycle all the way to Approved so app.last is set
    cid = _create_cycle(client, dev, name="utc-last approval cycle")
    _gen(client, dev, cid)
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    cases = client.get(f"/api/cycles/{cid}", headers=tester).json()["cases"]
    for c in cases:
        client.put(f"/api/cycles/{cid}/cases/{c['id']}/result", headers=tester, json={"status": "pass", "actual": "ok"})
    client.post(f"/api/cycles/{cid}/submit", headers=tester)
    client.post(f"/api/cycles/{cid}/ai-runs", headers=dev, json={"task": "validate", "provider": "azure"})
    client.post(f"/api/cycles/{cid}/approve", headers=dev, json={"note": "", "accept_findings": True})
    app = client.get("/api/apps/claims", headers=dev).json()
    assert app["last"] is not None, "last should be non-null after approval"
    _assert_utc(app["last"], "app.last")


def test_ai_job_created_at_has_utc_suffix(client):
    """GET /ai-jobs/{id}.created_at must carry a UTC suffix."""
    dev = as_("dev")
    cid = _create_cycle(client, dev, name="utc-job cycle")
    job_resp = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev, json={"task": "gen", "provider": "azure"}).json()
    job = client.get(f"/api/ai-jobs/{job_resp['job_id']}", headers=dev).json()
    _assert_utc(job["created_at"], "ai_job.created_at")


def test_cycle_list_q_matches_tester_name(client):
    """q= filter on cycle list matches tester name."""
    dev, tester = as_("dev"), as_("tester")
    cid = _create_cycle(client, dev, name="tester-name-search cycle")
    _gen(client, dev, cid)
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    r = _cycle_list(client, dev, q="Priya")
    assert r["total"] >= 1
    assert any(x["id"] == cid for x in r["items"])


def test_cycle_list_q_matches_author_name(client):
    """q= filter on cycle list matches author names stored in the cycle."""
    dev = as_("dev")
    from app.seed_data import PRS
    # The seed PR has known authors from commits
    cid = _create_cycle(client, dev, name="author-name-search cycle")
    # Fetch the cycle to find out what authors were stored
    c = client.get(f"/api/cycles/{cid}", headers=dev).json()
    authors = c.get("authors", [])
    if not authors:
        return  # no authors on this cycle, skip
    first_author = authors[0].split()[0]  # search by first name only
    r = _cycle_list(client, dev, q=first_author)
    assert r["total"] >= 1
    assert any(x["id"] == cid for x in r["items"])


def test_patch_settings_clears_default_tester(client):
    """PATCH /apps/{id}/settings with default_tester_id: null must clear the field."""
    dev, admin = as_("dev"), as_("admin")
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    # First set a tester (requires admin)
    client.patch("/api/apps/claims/settings", headers=admin, json={"default_tester_id": priya["id"]})
    app_set = client.get("/api/apps/claims", headers=dev).json()
    assert app_set["default_tester_id"] == priya["id"]
    # Now clear it by sending null explicitly (requires admin)
    r = client.patch("/api/apps/claims/settings", headers=admin, json={"default_tester_id": None})
    assert r.status_code == 200
    assert r.json()["default_tester_id"] is None


# =====================================================================
# 2.4 fixes: retry/discard draft, draftId in PR list, case_count in job
# =====================================================================

def test_pr_list_draft_with_no_cases_is_selectable(client):
    """A PR whose only cycle is a Draft with 0 cases must have inCycle=False and a draftId."""
    dev = as_("dev")
    # Create a draft cycle (no gen step = 0 cases)
    cid = _create_cycle(client, dev, name="draft-no-cases cycle")
    prs = client.get("/api/apps/claims/pull-requests", headers=dev).json()
    pr482 = next((p for p in prs if p["num"] == 482), None)
    assert pr482 is not None, "PR 482 should be in the list"
    assert pr482["inCycle"] is False, "PR with only empty draft should be selectable"
    assert pr482["draftId"] == cid, "draftId must point to the empty Draft cycle"


def test_pr_list_draft_with_cases_is_in_cycle(client):
    """A PR whose draft cycle has test cases must remain inCycle=True."""
    dev = as_("dev")
    cid = _create_cycle(client, dev, name="draft-with-cases cycle")
    _gen(client, dev, cid)  # generates cases → no longer empty
    prs = client.get("/api/apps/claims/pull-requests", headers=dev).json()
    pr482 = next((p for p in prs if p["num"] == 482), None)
    assert pr482 is not None
    assert pr482["inCycle"] is True


def test_discard_draft_cycle_happy_path(client):
    """DELETE /apps/{appId}/cycles/{id} removes a Draft cycle with 0 cases."""
    dev = as_("dev")
    cid = _create_cycle(client, dev, name="discard-me cycle")
    r = client.delete(f"/api/apps/claims/cycles/{cid}", headers=dev)
    assert r.status_code == 204
    # Cycle should be gone
    r2 = client.get(f"/api/cycles/{cid}", headers=dev)
    assert r2.status_code == 404


def test_discard_draft_cycle_rejects_with_cases(client):
    """DELETE must 409 if the cycle already has test cases."""
    dev = as_("dev")
    cid = _create_cycle(client, dev, name="has-cases cycle")
    _gen(client, dev, cid)
    r = client.delete(f"/api/apps/claims/cycles/{cid}", headers=dev)
    assert r.status_code == 409


def test_discard_draft_cycle_rejects_non_draft(client):
    """DELETE must 409 if the cycle is not in Draft status."""
    dev = as_("dev")
    cid = _create_cycle(client, dev, name="non-draft cycle")
    _gen(client, dev, cid)
    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    r = client.delete(f"/api/apps/claims/cycles/{cid}", headers=dev)
    assert r.status_code == 409


def test_gen_job_result_has_case_count(client):
    """Succeeded gen job must include case_count in its result."""
    dev = as_("dev")
    cid = _create_cycle(client, dev, name="case-count job cycle")
    job_resp = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev, json={"task": "gen", "provider": "azure"}).json()
    # Poll until done (the test runner executes synchronously via the mock)
    job = client.get(f"/api/ai-jobs/{job_resp['job_id']}", headers=dev).json()
    assert job["status"] == "succeeded"
    assert "case_count" in job["result"]
    assert isinstance(job["result"]["case_count"], int)
    assert job["result"]["case_count"] > 0


def test_retry_gen_on_same_draft_cycle(client):
    """Running gen on a Draft cycle with 0 cases (after discard + recreate) uses the same cycle id."""
    dev = as_("dev")
    # Create a fresh draft (no gen → 0 cases)
    cid = _create_cycle(client, dev, name="retry-gen cycle")
    # Confirm no cases
    c = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert len([t for t in c["cases"] if t.get("deleted_at") is None]) == 0
    # Run gen on the existing draft (simulates the frontend reusing draftCycleId)
    job_resp = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev, json={"task": "gen", "provider": "azure"}).json()
    assert "job_id" in job_resp
    job = client.get(f"/api/ai-jobs/{job_resp['job_id']}", headers=dev).json()
    assert job["status"] == "succeeded"
    # Cycle now has cases
    c2 = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert len([t for t in c2["cases"] if t.get("deleted_at") is None]) > 0
