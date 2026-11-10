"""In-memory source control returning the prototype's sample PRs (SCM_MODE=demo and tests)."""
from __future__ import annotations

from app.integrations.scm import CommitInfo, FileChange, PullRequestInfo, Repo
from app.seed_data import ADO, FILES, PRS


class DemoSourceControl:
    bug_seq = 1318

    def list_orgs(self) -> list[str]:
        return list(ADO)

    def list_projects(self, org: str) -> list[str]:
        return list(ADO.get(org, {}))

    def list_repos(self, org: str, project: str) -> list[Repo]:
        return [Repo(r["name"], r["updated"], r["branch"]) for r in ADO.get(org, {}).get(project, [])]

    def list_pull_requests(self, org: str, project: str, repo: str, target_branch: str) -> list[PullRequestInfo]:
        return [PullRequestInfo(p["num"], p["title"], p["author"], p["branch"], "main", p["created"], p["items"],
                                [CommitInfo(c["hash"], c["message"], c["author"], c["aiNote"], c["files"]) for c in p["commits"]])
                for p in PRS]

    def get_changes(self, org: str, project: str, repo: str, pr_number: int, commit_shas: list[str]) -> list[FileChange]:
        return [FileChange(f["status"], f["path"], f["added"], f["removed"]) for f in FILES] if pr_number == 482 else []

    def get_work_item_criteria(self, org: str, project: str, ids: list[str]) -> dict[str, str]:
        known = {
            "AB#1290": "Partial refunds on settled claims. Acceptance criteria: an adjuster can refund any amount up to the remaining balance; a reason is required; refunds are blocked on closed claims.",
            "AB#1294": "Billing receives refund events. Acceptance criteria: a RefundIssued event is published for every refund.",
        }
        return {i: known[i] for i in ids if i in known}

    def create_bug(self, org, project, title, repro_steps, severity, area_path, pr_number) -> str:
        DemoSourceControl.bug_seq += 1
        return f"AB#{DemoSourceControl.bug_seq - 1}"

    def set_pr_status(self, org, project, repo, pr_number, state, description) -> None:
        return None
