"""Tests for optimistic concurrency (version + If-Match) and soft delete / undo (1.2 + 1.3)."""
from app.seed_data import PRS
from tests.conftest import as_


def _create_cycle(client, dev):
    cid = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "concurrency test", "pr_numbers": [482],
        "commit_shas": [x["hash"] for x in PRS[0]["commits"]]}).json()["id"]
    # Trigger gen so we have cases to work with.
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "gen", "provider": "azure"}).json()["job_id"]
    client.get(f"/api/ai-jobs/{job_id}", headers=dev)  # background task ran synchronously; job is done
    return cid


def _cases(client, dev, cid):
    return client.get(f"/api/cycles/{cid}", headers=dev).json()["cases"]


# ---------- version fields ----------

def test_case_out_has_version(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    assert _cases(client, dev, cid)[0]["version"] == 1


def test_cycle_out_has_version(client):
    dev = as_("dev")
    cid = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "v test", "pr_numbers": [482],
        "commit_shas": [x["hash"] for x in PRS[0]["commits"]]}).json()["id"]
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert "version" in cyc and cyc["version"] >= 1


def test_cycle_version_increments_on_case_add(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)  # already in Tests Generated after gen
    v0 = client.get(f"/api/cycles/{cid}", headers=dev).json()["version"]
    client.post(f"/api/cycles/{cid}/cases", headers=dev, json={
        "title": "New case", "type": "Functional", "pri": "P2", "mod": "ui", "steps": ["Step 1"]})
    v1 = client.get(f"/api/cycles/{cid}", headers=dev).json()["version"]
    assert v1 == v0 + 1


# ---------- If-Match on PATCH (edit) ----------

def test_edit_case_requires_if_match(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    body = {k: tc[k] for k in ("title", "type", "pri", "mod", "file", "pre", "steps", "exp")}
    r = client.patch(f"/api/cycles/{cid}/cases/{tc['id']}", headers=dev, json=body)
    assert r.status_code == 428


def test_edit_case_wrong_version_409(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    body = {k: tc[k] for k in ("title", "type", "pri", "mod", "file", "pre", "steps", "exp")}
    r = client.patch(f"/api/cycles/{cid}/cases/{tc['id']}", headers={**dev, "If-Match": "999"}, json=body)
    assert r.status_code == 409


def test_edit_case_ok_increments_version(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    body = {k: tc[k] for k in ("title", "type", "pri", "mod", "file", "pre", "steps", "exp")}
    body["title"] = "Updated title"
    r = client.patch(f"/api/cycles/{cid}/cases/{tc['id']}", headers={**dev, "If-Match": str(tc["version"])}, json=body)
    assert r.status_code == 200
    assert r.json()["version"] == tc["version"] + 1


def test_stale_if_match_after_edit_conflicts(client):
    """Simulate two concurrent editors: second save with the original version fails."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    body = {k: tc[k] for k in ("title", "type", "pri", "mod", "file", "pre", "steps", "exp")}
    # First edit succeeds.
    r1 = client.patch(f"/api/cycles/{cid}/cases/{tc['id']}", headers={**dev, "If-Match": str(tc["version"])}, json=body)
    assert r1.status_code == 200
    # Second edit with the same (now stale) version → 409.
    r2 = client.patch(f"/api/cycles/{cid}/cases/{tc['id']}", headers={**dev, "If-Match": str(tc["version"])}, json=body)
    assert r2.status_code == 409


# ---------- If-Match on DELETE + soft delete ----------

def test_delete_case_requires_if_match(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    r = client.delete(f"/api/cycles/{cid}/cases/{tc['id']}", headers=dev)
    assert r.status_code == 428


def test_soft_delete_hides_case_from_list(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    key = tc["id"]
    r = client.delete(f"/api/cycles/{cid}/cases/{key}", headers={**dev, "If-Match": str(tc["version"])})
    assert r.status_code == 204
    after = _cases(client, dev, cid)
    assert not any(c["id"] == key for c in after)


def test_soft_delete_does_not_remove_other_cases(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    cases_before = _cases(client, dev, cid)
    tc = cases_before[0]
    client.delete(f"/api/cycles/{cid}/cases/{tc['id']}", headers={**dev, "If-Match": str(tc["version"])})
    cases_after = _cases(client, dev, cid)
    assert len(cases_after) == len(cases_before) - 1


# ---------- restore ----------

def test_restore_brings_case_back(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    key = tc["id"]
    client.delete(f"/api/cycles/{cid}/cases/{key}", headers={**dev, "If-Match": str(tc["version"])})
    r = client.post(f"/api/cycles/{cid}/cases/{key}/restore", headers=dev)
    assert r.status_code == 200
    restored = r.json()
    assert restored["id"] == key
    assert restored["version"] > tc["version"]
    after = _cases(client, dev, cid)
    assert any(c["id"] == key for c in after)


def test_restore_non_deleted_case_returns_404(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    key = _cases(client, dev, cid)[0]["id"]
    r = client.post(f"/api/cycles/{cid}/cases/{key}/restore", headers=dev)
    assert r.status_code == 404


def test_cycle_version_increments_on_delete_and_restore(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    v0 = client.get(f"/api/cycles/{cid}", headers=dev).json()["version"]
    client.delete(f"/api/cycles/{cid}/cases/{tc['id']}", headers={**dev, "If-Match": str(tc["version"])})
    v1 = client.get(f"/api/cycles/{cid}", headers=dev).json()["version"]
    assert v1 == v0 + 1
    client.post(f"/api/cycles/{cid}/cases/{tc['id']}/restore", headers=dev)
    v2 = client.get(f"/api/cycles/{cid}", headers=dev).json()["version"]
    assert v2 == v1 + 1


def test_tester_cannot_restore(client):
    dev, tester = as_("dev"), as_("tester")
    cid = _create_cycle(client, dev)
    tc = _cases(client, dev, cid)[0]
    client.delete(f"/api/cycles/{cid}/cases/{tc['id']}", headers={**dev, "If-Match": str(tc["version"])})
    r = client.post(f"/api/cycles/{cid}/cases/{tc['id']}/restore", headers=tester)
    assert r.status_code == 403
