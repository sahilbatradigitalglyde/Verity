"""Azure DevOps REST client, called *as the signed-in user* via the Entra on-behalf-of flow,
so Verity only ever sees what the user can already open in Azure DevOps."""
from __future__ import annotations

import base64

import httpx
import msal

from app.core.config import get_settings
from app.integrations.scm import CommitInfo, FileChange, PullRequestInfo, Repo

ADO_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798/.default"  # Azure DevOps first-party app id
API = "7.1"


def obo_token(user_token: str) -> str:
    s = get_settings()
    app = msal.ConfidentialClientApplication(
        s.entra_api_client_id, client_credential=s.entra_api_client_secret,
        authority=f"https://login.microsoftonline.com/{s.entra_tenant_id}",
    )
    r = app.acquire_token_on_behalf_of(user_token, scopes=[ADO_RESOURCE])
    if "access_token" not in r:
        raise PermissionError(r.get("error_description", "Azure DevOps token exchange failed"))
    return r["access_token"]


class AzureDevOps:
    def __init__(self, user_token: str):
        self.http = httpx.Client(headers={"Authorization": f"Bearer {obo_token(user_token)}"}, timeout=30)

    def _get(self, url: str, **params) -> dict:
        r = self.http.get(url, params={"api-version": API, **params})
        r.raise_for_status()
        return r.json()

    def list_orgs(self) -> list[str]:
        orgs = get_settings().ado_organizations
        return [o.strip() for o in orgs.split(",") if o.strip()]

    def list_projects(self, org: str) -> list[str]:
        return [p["name"] for p in self._get(f"https://dev.azure.com/{org}/_apis/projects")["value"]]

    def list_repos(self, org: str, project: str) -> list[Repo]:
        v = self._get(f"https://dev.azure.com/{org}/{project}/_apis/git/repositories")["value"]
        return [Repo(r["name"], r.get("project", {}).get("lastUpdateTime", ""), (r.get("defaultBranch") or "refs/heads/main").removeprefix("refs/heads/")) for r in v]

    def list_pull_requests(self, org: str, project: str, repo: str, target_branch: str) -> list[PullRequestInfo]:
        base = f"https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}"
        prs = self._get(f"{base}/pullrequests", **{"searchCriteria.status": "active", "searchCriteria.targetRefName": f"refs/heads/{target_branch}"})["value"]
        out = []
        for p in prs:
            n = p["pullRequestId"]
            commits = self._get(f"{base}/pullRequests/{n}/commits")["value"]
            wis = self._get(f"{base}/pullRequests/{n}/workitems")["value"]
            out.append(PullRequestInfo(
                number=n, title=p["title"], author=p["createdBy"]["displayName"],
                source_branch=p["sourceRefName"].removeprefix("refs/heads/"), target_branch=target_branch,
                created=p["creationDate"][:10], work_items=[f"AB#{w['id']}" for w in wis],
                commits=[CommitInfo(c["commitId"][:7], c["comment"].splitlines()[0], c["author"]["name"],
                                    _ai_note(c["comment"]), c.get("changeCounts", {}).get("Edit", 0) + c.get("changeCounts", {}).get("Add", 0))
                         for c in commits],
            ))
        return out

    def get_changes(self, org: str, project: str, repo: str, pr_number: int, commit_shas: list[str]) -> list[FileChange]:
        base = f"https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}"
        iters = self._get(f"{base}/pullRequests/{pr_number}/iterations")["value"]
        last = iters[-1]["id"]
        ch = self._get(f"{base}/pullRequests/{pr_number}/iterations/{last}/changes")["changeEntries"]
        kind = {"add": "A", "edit": "M", "delete": "D"}
        # Line counts and unified diffs come from the diffs API; kept out of this skeleton for brevity.
        return [FileChange(kind.get(c["changeType"].split(",")[0], "M"), c["item"]["path"].lstrip("/"), 0, 0) for c in ch]

    def get_work_item_criteria(self, org: str, project: str, ids: list[str]) -> dict[str, str]:
        nums = ",".join(i.removeprefix("AB#") for i in ids)
        if not nums:
            return {}
        v = self._get(f"https://dev.azure.com/{org}/{project}/_apis/wit/workitems", ids=nums,
                      fields="System.Title,Microsoft.VSTS.Common.AcceptanceCriteria")["value"]
        return {f"AB#{w['id']}": f"{w['fields'].get('System.Title', '')}. Acceptance criteria: {w['fields'].get('Microsoft.VSTS.Common.AcceptanceCriteria', '')}" for w in v}

    def create_bug(self, org: str, project: str, title: str, repro_steps: str, severity: str, area_path: str, pr_number: int | None) -> str:
        ops = [
            {"op": "add", "path": "/fields/System.Title", "value": title},
            {"op": "add", "path": "/fields/Microsoft.VSTS.TCM.ReproSteps", "value": repro_steps.replace("\n", "<br>")},
            {"op": "add", "path": "/fields/Microsoft.VSTS.Common.Severity", "value": severity},
            {"op": "add", "path": "/fields/System.AreaPath", "value": area_path},
        ]
        r = self.http.post(f"https://dev.azure.com/{org}/{project}/_apis/wit/workitems/$Bug", params={"api-version": API},
                           json=ops, headers={"Content-Type": "application/json-patch+json"})
        r.raise_for_status()
        return f"AB#{r.json()['id']}"

    def set_pr_status(self, org: str, project: str, repo: str, pr_number: int, state: str, description: str) -> None:
        r = self.http.post(
            f"https://dev.azure.com/{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{pr_number}/statuses",
            params={"api-version": API},
            json={"state": state, "description": description, "context": {"name": "uat-ready", "genre": "verity"}},
        )
        r.raise_for_status()


def _ai_note(comment: str) -> str:
    """AI commit notes / check-in release notes: text after an 'AI-Notes:' trailer, if present."""
    for marker in ("AI-Notes:", "Release-Notes:"):
        if marker in comment:
            return comment.split(marker, 1)[1].strip()
    return ""


def basic_pat_header(pat: str) -> str:
    """Optional: PAT auth for service jobs (webhooks) where no user token exists."""
    return "Basic " + base64.b64encode(f":{pat}".encode()).decode()
