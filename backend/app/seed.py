"""Seed the database with the prototype's sample data.   python -m app.seed  [--reset] [--demo]"""
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import Base, SessionLocal, engine
from app.models import App, Cycle, CycleStatus, RegressionCase, Role, TestCase, User
from app.seed_data import APPS, FILES, MODS, MODREG, PRS, REG, SUGG, TPL

USERS = [
    ("daniel.okafor@contoso.com", "Daniel Okafor", "DO", Role.senior_developer),
    ("priya.shah@contoso.com", "Priya Shah", "PS", Role.tester),
    ("sam.patel@contoso.com", "Sam Patel", "SP", Role.admin),
    ("marcus.lee@contoso.com", "Marcus Lee", "ML", Role.developer),
    ("anika.rao@contoso.com", "Anika Rao", "AR", Role.developer),
    ("tomas.rivera@contoso.com", "Tomás Rivera", "TR", Role.tester_lead),
    ("jordan.kim@contoso.com", "Jordan Kim", "JK", Role.tester),
]
SUITE_DETAILS = {s["reg"]: s for s in SUGG}


def seed(reset: bool = False):
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)  # no-op when Alembic already created the tables
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)):
            print("Already seeded")
            return
        db.add_all(User(email=e, name=n, initials=i, role=r) for e, n, i, r in USERS)
        for a in APPS:
            org, project, repo = [x.strip() for x in a["path"].split("/")]
            db.add(App(id=a["id"], name=a["name"], initials=a["ini"], org=org, project=project, repo=repo))
        db.flush()
        for r in REG:
            d = SUITE_DETAILS.get(r["id"], {})
            db.add(RegressionCase(id=r["id"], app_id="claims", title=r["title"], module=r["mod"], priority=r["pri"],
                                  preconditions=d.get("pre", ""), steps=d.get("steps", []), expected=d.get("exp", ""),
                                  last_run=r["last"], last_result=r["res"], history=r["hist"], source_cycle=r["src"]))
        db.commit()
        print(f"Seeded {len(USERS)} users, {len(APPS)} apps, {len(REG)} regression cases")


def seed_demo(db: Session) -> None:
    """Create a demo cycle for PR #482 at Tests Generated status with 14 cases.

    Gives local developers a pre-populated database that mirrors the prototype.
    """
    if db.scalar(select(Cycle).limit(1)):
        print("Demo cycle already exists, skipping")
        return
    dev = db.scalar(select(User).where(User.email == "daniel.okafor@contoso.com"))
    pr = PRS[0]
    c = Cycle(
        app_id="claims",
        name="PR #482 · Add partial refund support to claim settlement",
        kind="pr",
        pr_number=482,
        pr_title=pr["title"],
        pr_numbers=[482],
        source_branch=pr["branch"],
        target_branch="main",
        authors=sorted({commit["author"] for commit in pr["commits"]}),
        commits=[{"hash": x["hash"], "message": x["message"], "author": x["author"],
                  "ai_note": x.get("aiNote", ""), "files": x["files"]} for x in pr["commits"]],
        files=[{"status": f["status"], "path": f["path"], "added": f["added"], "removed": f["removed"]} for f in FILES],
        status=CycleStatus.tests_generated,
        modules=[{"id": m["id"], "name": m["name"], "risk": m["risk"], "desc": m["desc"], "suite_module": MODREG.get(m["id"], "")} for m in MODS],
        summary="Adjusters can now refund part of a settled claim instead of reversing the whole settlement. "
                "Refunds are stored in a new ledger, validated against the remaining balance, blocked on "
                "closed claims, and sent to Billing as an event. The settlement summary shows refunded and remaining amounts.",
        created_by_id=dev.id if dev else None,
    )
    db.add(c)
    db.flush()
    for i, t in enumerate(TPL, 1):
        db.add(TestCase(cycle_id=c.id, key=t["id"], position=i,
                        title=t["title"], type=t["type"], priority=t["pri"],
                        linked_file=t["file"], source=t["src"], module=t["mod"],
                        preconditions=t["pre"], steps=t["steps"], expected=t["exp"]))
    # Stamp the app's module vocabulary from the demo data
    app = db.get(App, "claims")
    if app and not app.modules:
        app.modules = [{"id": m["id"], "name": m["name"], "risk": m["risk"], "desc": m["desc"], "suite_module": MODREG.get(m["id"], "")} for m in MODS]
    db.commit()
    print(f"Demo cycle seeded: PR #482 · {len(TPL)} cases")


if __name__ == "__main__":
    demo = "--demo" in sys.argv
    reset = "--reset" in sys.argv
    seed(reset=reset)
    if demo:
        with SessionLocal() as db:
            seed_demo(db)
