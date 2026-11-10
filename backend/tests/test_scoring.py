from app.seed_data import MODS, SAMPLE, TPL
from app.services.scoring import CaseView, Findings, analyze


def sample_cases():
    return [CaseView(t["id"], t["title"], t["pri"], t["mod"], SAMPLE[t["id"]]["status"], SAMPLE[t["id"]]["actual"],
                     len(SAMPLE[t["id"]]["evidence"]), "AB#1318" if SAMPLE[t["id"]]["bug"] else "") for t in TPL]


def test_prototype_sample_scores_82():
    mods = [{"id": m["id"], "name": m["name"], "risk": m["risk"]} for m in MODS]
    f = Findings(consistency=[{"case_id": "TC-09", "reason": ""}], gaps=[{"case_id": "TC-05", "reason": ""}])
    r = analyze(sample_cases(), mods, f)
    assert r["score"] == 82
    assert r["verdict"] == "Ready for UAT with 2 observations"
    assert r["counts"] == {"pass": 12, "fail": 1, "blocked": 1, "na": 0, "none": 0}
    assert r["verified_modules"] == 4
    assert [p["value"] for p in r["parts"]] == [80, 86, 89, 86]


def test_p1_failure_blocks_ready_verdict():
    cases = [CaseView("TC-01", "x", "P1", "settle", "fail")]
    r = analyze(cases, [{"id": "settle", "name": "S", "risk": "High"}], None)
    assert r["verdict"] == "Not ready: a P1 case failed"
