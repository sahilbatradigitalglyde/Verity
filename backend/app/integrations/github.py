"""GitHub implementation of SourceControl (planned, see docs/12_INTEGRATIONS.md).

Mapping: org → owner, project → (unused), repo → repo, work items → linked issues,
bug → GitHub issue with label `bug`, PR status → commit status `verity/uat-ready`.
Two-way sync: GitHub webhooks (pull_request, push) feed the same handlers as Azure DevOps service hooks.
"""
from __future__ import annotations

import httpx

from app.integrations.scm import CommitInfo, FileChange, PullRequestInfo, Repo


class GitHub:
    def __init__(self, token: str):
        self.http = httpx.Client(base_url="https://api.github.com", timeout=30,
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})

    def list_orgs(self) -> list[str]:
        return [o["login"] for o in self.http.get("/user/orgs").json()]

    def list_projects(self, org: str) -> list[str]:
        return [org]  # GitHub has no project level for repos

    def list_repos(self, org: str, project: str) -> list[Repo]:
        return [Repo(r["name"], r["pushed_at"], r["default_branch"]) for r in self.http.get(f"/orgs/{org}/repos", params={"per_page": 100}).json()]

    def list_pull_requests(self, org: str, project: str, repo: str, target_branch: str) -> list[PullRequestInfo]:
        prs = self.http.get(f"/repos/{org}/{repo}/pulls", params={"state": "open", "base": target_branch}).json()
        out = []
        for p in prs:
            commits = self.http.get(f"/repos/{org}/{repo}/pulls/{p['number']}/commits").json()
            out.append(PullRequestInfo(p["number"], p["title"], p["user"]["login"], p["head"]["ref"], target_branch, p["created_at"][:10], [],
                                       [CommitInfo(c["sha"][:7], c["commit"]["message"].splitlines()[0], c["commit"]["author"]["name"], "", 0) for c in commits]))
        return out

    def get_changes(self, org: str, project: str, repo: str, pr_number: int, commit_shas: list[str]) -> list[FileChange]:
        files = self.http.get(f"/repos/{org}/{repo}/pulls/{pr_number}/files", params={"per_page": 100}).json()
        st = {"added": "A", "modified": "M", "removed": "D"}
        return [FileChange(st.get(f["status"], "M"), f["filename"], f["additions"], f["deletions"], f.get("patch", "")) for f in files]

    def get_work_item_criteria(self, org: str, project: str, ids: list[str]) -> dict[str, str]:
        return {}

    def create_bug(self, org, project, title, repro_steps, severity, area_path, pr_number) -> str:
        r = self.http.post(f"/repos/{org}/{project}/issues", json={"title": title, "body": repro_steps, "labels": ["bug", f"severity:{severity}"]})
        r.raise_for_status()
        return f"#{r.json()['number']}"

    def set_pr_status(self, org, project, repo, pr_number, state, description) -> None:
        sha = self.http.get(f"/repos/{org}/{repo}/pulls/{pr_number}").json()["head"]["sha"]
        self.http.post(f"/repos/{org}/{repo}/statuses/{sha}", json={"state": state, "description": description, "context": "verity/uat-ready"}).raise_for_status()
