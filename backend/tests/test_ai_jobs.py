"""Tests for async AI jobs: POST returns 202 + job_id, GET /ai-jobs/{id} tracks progress."""
from app.seed_data import PRS
from tests.conftest import as_


def _create_cycle(client, headers):
    return client.post("/api/apps/claims/cycles", headers=headers, json={
        "name": "AI job test cycle", "pr_numbers": [482],
        "commit_shas": [x["hash"] for x in PRS[0]["commits"]]}).json()["id"]


def test_ai_run_returns_job_id(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    resp = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev, json={"task": "gen", "provider": "azure"})
    assert resp.status_code == 202
    body = resp.json()
    assert "job_id" in body and body["job_id"]


def test_ai_job_status_queued_then_succeeded(client):
    """Background tasks run synchronously in TestClient, so the job is succeeded immediately."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "gen", "provider": "azure"}).json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert job["status"] == "succeeded"
    assert job["step"] == len(job["steps"])
    assert job["steps"] == ["Reading diffs from Azure DevOps", "Reading AI commit notes and linked work items",
                            "Sending to Azure OpenAI", "Checking the response format", "Matching against the regression suite"]
    assert job["result"] is not None
    assert "run" in job["result"]
    assert job["ai_run_id"] is not None
    assert job["error"] is None
    assert job["finished_at"] is not None


def test_ai_job_applies_to_cycle(client):
    """After a gen job completes the cycle status must be Tests Generated."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "gen", "provider": "azure"}).json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert job["status"] == "succeeded"
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert cyc["status"] == "Tests Generated"
    assert len(cyc["cases"]) > 0


def test_validate_job_carries_report(client):
    """A validate job stores the report inside result."""
    dev, tester = as_("dev"), as_("tester")
    cid = _create_cycle(client, dev)
    # gen → assign → all pass → submit → validate
    client.post(f"/api/cycles/{cid}/ai-runs", headers=dev, json={"task": "gen", "provider": "azure"})
    priya = next(u for u in client.get("/api/users/testers", headers=dev).json() if u["name"] == "Priya Shah")
    client.post(f"/api/cycles/{cid}/assign", headers=dev, json={"tester_id": priya["id"]})
    keys = [c["id"] for c in client.get(f"/api/cycles/{cid}", headers=dev).json()["cases"]]
    for k in keys:
        client.put(f"/api/cycles/{cid}/cases/{k}/result", headers=tester, json={"status": "pass", "actual": "ok"})
    client.post(f"/api/cycles/{cid}/submit", headers=tester)
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "validate", "provider": "claude"}).json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert job["status"] == "succeeded"
    assert "report" in job["result"]
    assert "score" in job["result"]["report"]


def test_dups_job_returns_pairs(client):
    dev = as_("dev")
    resp = client.post("/api/apps/claims/regression/scan-duplicates", headers=dev, json={"provider": "claude"})
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert job["status"] == "succeeded"
    assert job["task"] == "dups"
    assert "pairs" in job["result"]
    assert len(job["result"]["pairs"]) > 0


def test_ai_job_not_found(client):
    dev = as_("dev")
    assert client.get("/api/ai-jobs/nonexistent", headers=dev).status_code == 404


def test_ai_job_role_guard(client):
    """Tester cannot trigger gen/regen/validate — guard fires before job is created."""
    tester = as_("tester")
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    assert client.post(f"/api/cycles/{cid}/ai-runs", headers=tester,
                       json={"task": "gen", "provider": "azure"}).status_code == 403


def test_ai_job_steps_for_dups(client):
    dev = as_("dev")
    resp = client.post("/api/apps/claims/regression/scan-duplicates", headers=dev, json={"provider": "azure"})
    job_id = resp.json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert job["steps"] == ["Loading the regression suite", "Sending to Azure OpenAI", "Checking the response format"]
