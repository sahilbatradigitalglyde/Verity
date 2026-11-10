"""End to end: PR #482 from Draft to Approved for UAT, through the API, with the demo AI provider."""
from app.seed_data import PRS, SAMPLE
from tests.conftest import as_


def _ai_run(client, cycle_id: str, headers: dict, task: str, provider: str, **kw) -> dict:
    """POST ai-run → poll job until done → return the job payload."""
    body = {"task": task, "provider": provider, **kw}
    resp = client.post(f"/api/cycles/{cycle_id}/ai-runs", headers=headers, json=body)
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["job_id"]
    # TestClient runs background tasks synchronously, so the job is done immediately.
    job = client.get(f"/api/ai-jobs/{job_id}", headers=headers).json()
    assert job["status"] == "succeeded", job
    return job


def test_full_cycle(client):
    dev, tester = as_("dev"), as_("tester")
    assert len(client.get("/api/apps", headers=dev).json()) == 6
    prs = client.get("/api/apps/claims/pull-requests", headers=dev).json()
    assert prs[0]["num"] == 482 and len(prs[0]["commits"]) == 6

    c = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "PR #482 · Add partial refund support to claim settlement", "pr_numbers": [482],
        "commit_shas": [x["hash"] for x in PRS[0]["commits"]]}).json()
    cid = c["id"]
    assert c["status"] == "Draft" and c["file_count"] == 19

    # tester cannot generate
    assert client.post(f"/api/cycles/{cid}/ai-runs", headers=tester, json={"task": "gen", "provider": "azure"}).status_code == 403

    job = _ai_run(client, cid, dev, "gen", "azure")
    assert job["result"]["run"]["id"] == "VR-482-GEN-001"
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert cyc["status"] == "Tests Generated" and len(cyc["cases"]) == 14
    assert cyc["cases"][2]["title"] == "Refund on closed claim shows error"

    # curate: edit, add manual, regenerate keeps both
    tc = cyc["cases"][0]
    assert client.patch(f"/api/cycles/{cid}/cases/TC-01", headers={**dev, "If-Match": str(tc["version"])},
                        json={**{k: tc[k] for k in ("title", "type", "pri", "mod", "file", "pre", "steps", "exp")},
                              "title": "Partial refund below settled amount succeeds"}).status_code == 200
    tc15 = client.post(f"/api/cycles/{cid}/cases", headers=dev,
                       json={"title": "Manual", "type": "Functional", "pri": "P3", "mod": "ui", "steps": ["Open"]}).json()
    assert tc15["id"] == "TC-15"
    rjob = _ai_run(client, cid, dev, "regen", "claude")
    cyc_after_regen = client.get(f"/api/cycles/{cid}", headers=dev).json()
    tc15_current = next(x for x in cyc_after_regen["cases"] if x["id"] == "TC-15")
    titles = [x["title"] for x in cyc_after_regen["cases"]]
    assert "Partial refund below settled amount succeeds" in titles and "Manual" in titles and len(titles) == 15
    assert client.delete(f"/api/cycles/{cid}/cases/TC-15",
                         headers={**dev, "If-Match": str(tc15_current["version"])}).status_code == 204

    testers = client.get("/api/users/testers", headers=dev).json()
    priya = next(u for u in testers if u["name"] == "Priya Shah")
    a = client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"], "due": "2026-11-06"}).json()
    assert a["status"] == "Assigned"
    # cases now locked
    assert client.post(f"/api/cycles/{cid}/cases", headers=dev, json={"title": "x", "type": "Functional", "pri": "P3", "mod": "ui", "steps": ["a"]}).status_code == 409

    # tester records the prototype's sample results
    assert client.post(f"/api/cycles/{cid}/submit", headers=tester).status_code == 422
    for key, smp in SAMPLE.items():
        for f in smp["evidence"]:
            assert client.post(f"/api/cycles/{cid}/cases/{key}/evidence", headers=tester, json={"file_name": f}).status_code == 201
        bug = ""
        if smp["bug"]:
            bug = client.post(f"/api/cycles/{cid}/cases/{key}/bug", headers=tester, json={"title": f"{key} failed", "repro_steps": "1. x"}).json()["bug"]
        res = client.put(f"/api/cycles/{cid}/cases/{key}/result", headers=tester, json={"status": smp["status"], "actual": smp["actual"], "bug": bug})
        assert res.status_code == 200, res.text
    s = client.post(f"/api/cycles/{cid}/submit", headers=tester).json()
    assert s["status"] == "Submitted"

    vjob = _ai_run(client, cid, dev, "validate", "claude")
    rep = vjob["result"]["report"]
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert cyc["status"] == "AI Reviewed"
    assert rep["score"] == 82, rep
    assert rep["verdict"] == "Ready for UAT with 2 observations"
    assert [x["case_id"] for x in rep["consistency"]] == ["TC-09"]
    assert [x["case_id"] for x in rep["evidence_gaps"]] == ["TC-05"]

    assert client.post(f"/api/cycles/{cid}/approve", headers=dev, json={"note": ""}).status_code == 422
    ap = client.post(f"/api/cycles/{cid}/approve", headers=dev, json={"note": "Rounding fix in 2026.11.1", "accept_findings": True}).json()
    assert ap["status"] == "Approved for UAT"

    trail = client.get(f"/api/cycles/{cid}/audit", headers=dev).json()
    actions = [e["action"] for e in trail]
    assert actions[0].startswith("Created the cycle") and "Approved for client UAT" in actions
    assert any(e["who"]["name"] == "Verity AI" for e in trail)


def test_changes_requested_loop(client):
    dev, tester = as_("dev"), as_("tester")
    cid = client.post("/api/apps/claims/cycles", headers=dev, json={"name": "c", "pr_numbers": [490], "commit_shas": ["5b7a0e9"]}).json()["id"]
    _ai_run(client, cid, dev, "gen", "azure")
    priya = next(u for u in client.get("/api/users/testers", headers=dev).json() if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    keys = [c["id"] for c in client.get(f"/api/cycles/{cid}", headers=dev).json()["cases"]]
    for k in keys:
        client.put(f"/api/cycles/{cid}/cases/{k}/result", headers=tester, json={"status": "pass", "actual": "ok"})
    client.post(f"/api/cycles/{cid}/submit", headers=tester)
    _ai_run(client, cid, dev, "validate", "azure")
    r = client.post(f"/api/cycles/{cid}/request-changes", headers=dev, json={"comment": "Attach evidence"}).json()
    assert r["status"] == "Changes Requested"
    r = client.put(f"/api/cycles/{cid}/cases/TC-01/result", headers=tester, json={"status": "pass", "actual": "ok again"})
    assert client.get(f"/api/cycles/{cid}", headers=dev).json()["status"] == "In Testing"


def test_regression_scan_and_merge(client):
    dev = as_("dev")
    resp = client.post("/api/apps/claims/regression/scan-duplicates", headers=dev, json={"provider": "claude"})
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert job["status"] == "succeeded"
    assert {(p["a"], p["b"]) for p in job["result"]["pairs"]} == {("REG-118", "REG-131"), ("REG-201", "REG-209")}
    m = client.post("/api/apps/claims/regression/merge", headers=dev, json={"keep": "REG-118", "drop": "REG-131"}).json()
    assert m["id"] == "REG-118"
    ids = [x["id"] for x in client.get("/api/apps/claims/regression", headers=dev).json()["items"]]
    assert "REG-131" not in ids
