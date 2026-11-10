"""Tests for tasks 1.6 (per-app module mapping), 1.7 (release cycles), 1.9 (seed --demo)."""
from app.core.db import SessionLocal
from app.seed import seed_demo
from app.seed_data import MODS, PRS
from tests.conftest import as_


# ---------- helpers ----------

def _create_cycle(client, dev, name="cycle", pr=482):
    shas = [x["hash"] for x in PRS[0]["commits"]]
    return client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": name, "pr_numbers": [pr], "commit_shas": shas}).json()["id"]


def _gen(client, dev, cid):
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "gen", "provider": "azure"}).json()["job_id"]
    client.get(f"/api/ai-jobs/{job_id}", headers=dev)


# =====================================================================
# 1.6  Per-app module mapping
# =====================================================================

def test_app_starts_with_empty_modules(client):
    dev = as_("dev")
    app = client.get("/api/apps/claims", headers=dev).json()
    assert "modules" in app
    assert app["modules"] == []


def test_gen_saves_modules_to_app(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    _gen(client, dev, cid)
    app = client.get("/api/apps/claims", headers=dev).json()
    assert len(app["modules"]) > 0
    mod = app["modules"][0]
    assert {"id", "name", "risk", "desc"} <= mod.keys()


def test_gen_module_ids_match_expected(client):
    """Module IDs from the demo AI match MODS from seed_data."""
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    _gen(client, dev, cid)
    app = client.get("/api/apps/claims", headers=dev).json()
    app_mod_ids = {m["id"] for m in app["modules"]}
    expected_ids = {m["id"] for m in MODS}
    assert app_mod_ids == expected_ids


def test_subsequent_gen_preserves_app_modules(client):
    """Second gen on a different cycle does not overwrite app.modules."""
    dev = as_("dev")
    cid1 = _create_cycle(client, dev, name="first cycle")
    _gen(client, dev, cid1)
    mods_after_first = client.get("/api/apps/claims", headers=dev).json()["modules"]

    cid2 = _create_cycle(client, dev, name="second cycle")
    _gen(client, dev, cid2)
    mods_after_second = client.get("/api/apps/claims", headers=dev).json()["modules"]

    # Modules should be the same (set once, not overwritten)
    assert mods_after_first == mods_after_second


def test_settings_updates_app_modules(client):
    admin, dev = as_("admin"), as_("dev")
    custom = [{"id": "auth", "name": "Authentication", "risk": "High", "desc": "Login and token flow"}]
    r = client.patch("/api/apps/claims/settings", headers=admin, json={"modules": custom})
    assert r.status_code == 200
    assert r.json()["modules"] == custom

    # Persisted: GET returns updated modules
    app = client.get("/api/apps/claims", headers=dev).json()
    assert app["modules"] == custom


def test_cycle_detail_has_modules_field(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    _gen(client, dev, cid)
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert "modules" in cyc
    assert len(cyc["modules"]) > 0


# =====================================================================
# 1.7  Release cycles
# =====================================================================

def test_single_pr_cycle_has_kind_pr(client):
    dev = as_("dev")
    cid = _create_cycle(client, dev)
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert cyc["kind"] == "pr"
    assert cyc["pr_numbers"] == [482]


def test_release_cycle_creation(client):
    dev = as_("dev")
    # PRs 482 and 490 both exist in demo data
    shas_482 = [x["hash"] for x in PRS[0]["commits"]]
    shas_490 = [x["hash"] for x in PRS[1]["commits"]]
    r = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "Release 2026.11.0",
        "pr_numbers": [482, 490],
        "commit_shas": shas_482 + shas_490,
    })
    assert r.status_code == 201
    cyc = r.json()
    assert cyc["kind"] == "release"
    assert set(cyc["pr_numbers"]) == {482, 490}
    assert cyc["pr_number"] == 482  # primary PR (first chosen)


def test_release_cycle_merges_commits(client):
    dev = as_("dev")
    shas_482 = [x["hash"] for x in PRS[0]["commits"]]
    shas_490 = [x["hash"] for x in PRS[1]["commits"]]
    r = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "Release 2026.11.0",
        "pr_numbers": [482, 490],
        "commit_shas": shas_482 + shas_490,
    })
    cyc = r.json()
    # Commits from both PRs should all be present
    assert cyc["commit_count"] == len(shas_482) + len(shas_490)


def test_release_cycle_merges_files(client):
    """Files from both PRs are merged; PR 482 has files, PR 490 has none in demo."""
    dev = as_("dev")
    shas_482 = [x["hash"] for x in PRS[0]["commits"]]
    shas_490 = [x["hash"] for x in PRS[1]["commits"]]
    r = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "Release 2026.11.0",
        "pr_numbers": [482, 490],
        "commit_shas": shas_482 + shas_490,
    })
    cyc = r.json()
    # PR 482 has 19 files in demo; PR 490 returns [] (not PR 482)
    assert cyc["file_count"] == 19


def test_release_cycle_gen_works(client):
    dev = as_("dev")
    shas_482 = [x["hash"] for x in PRS[0]["commits"]]
    shas_490 = [x["hash"] for x in PRS[1]["commits"]]
    r = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "Release 2026.11.0",
        "pr_numbers": [482, 490],
        "commit_shas": shas_482 + shas_490,
    })
    cid = r.json()["id"]
    job_id = client.post(f"/api/cycles/{cid}/ai-runs", headers=dev,
                         json={"task": "gen", "provider": "azure"}).json()["job_id"]
    job = client.get(f"/api/ai-jobs/{job_id}", headers=dev).json()
    assert job["status"] == "succeeded"
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert cyc["status"] == "Tests Generated"
    assert len(cyc["cases"]) > 0


def test_release_cycle_appears_in_list(client):
    dev = as_("dev")
    shas_482 = [x["hash"] for x in PRS[0]["commits"]]
    shas_490 = [x["hash"] for x in PRS[1]["commits"]]
    client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "Release 2026.11.0",
        "pr_numbers": [482, 490],
        "commit_shas": shas_482 + shas_490,
    })
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    release = next((x for x in items if x["kind"] == "release"), None)
    assert release is not None
    assert set(release["pr_numbers"]) == {482, 490}


def test_release_cycle_audit_mentions_prs(client):
    dev = as_("dev")
    shas_482 = [x["hash"] for x in PRS[0]["commits"]]
    shas_490 = [x["hash"] for x in PRS[1]["commits"]]
    r = client.post("/api/apps/claims/cycles", headers=dev, json={
        "name": "Release 2026.11.0",
        "pr_numbers": [482, 490],
        "commit_shas": shas_482 + shas_490,
    })
    cid = r.json()["id"]
    trail = client.get(f"/api/cycles/{cid}/audit", headers=dev).json()
    first = trail[0]["action"]
    assert "#482" in first and "#490" in first


# =====================================================================
# 1.9  Seed --demo
# =====================================================================

def test_seed_demo_creates_cycle(client):
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    assert len(items) == 1
    assert items[0]["pr_number"] == 482
    assert items[0]["kind"] == "pr"


def test_seed_demo_creates_14_cases(client):
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    cid = items[0]["id"]
    cyc = client.get(f"/api/cycles/{cid}", headers=dev).json()
    assert len(cyc["cases"]) == 14
    assert cyc["status"] == "Tests Generated"


def test_seed_demo_cycle_has_pr_numbers(client):
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    assert items[0]["pr_numbers"] == [482]


def test_seed_demo_stamps_app_modules(client):
    with SessionLocal() as db:
        seed_demo(db)
    dev = as_("dev")
    app = client.get("/api/apps/claims", headers=dev).json()
    assert len(app["modules"]) == len(MODS)
    ids = {m["id"] for m in app["modules"]}
    assert ids == {m["id"] for m in MODS}


def test_seed_demo_idempotent(client):
    """Calling seed_demo twice does not raise or create duplicate cycles."""
    with SessionLocal() as db:
        seed_demo(db)
    with SessionLocal() as db:
        seed_demo(db)  # second call should print "already exists" and return
    dev = as_("dev")
    items = client.get("/api/apps/claims/cycles", headers=dev).json()["items"]
    assert len(items) == 1
