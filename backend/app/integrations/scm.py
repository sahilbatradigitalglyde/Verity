"""Source-control integration. Azure DevOps today; GitHub implements the same interface (two-way sync),
so screens and services never care where a repo lives."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Repo:
    name: str
    updated: str
    default_branch: str


@dataclass
class CommitInfo:
    hash: str
    message: str
    author: str
    ai_note: str  # AI commit notes / dev check-in release notes, "" when absent
    files: int


@dataclass
class PullRequestInfo:
    number: int
    title: str
    author: str
    source_branch: str
    target_branch: str
    created: str
    work_items: list[str] = field(default_factory=list)
    commits: list[CommitInfo] = field(default_factory=list)


@dataclass
class FileChange:
    status: str  # A | M | D
    path: str
    added: int
    removed: int
    diff: str = ""


class SourceControl(Protocol):
    def list_orgs(self) -> list[str]: ...
    def list_projects(self, org: str) -> list[str]: ...
    def list_repos(self, org: str, project: str) -> list[Repo]: ...
    def list_pull_requests(self, org: str, project: str, repo: str, target_branch: str) -> list[PullRequestInfo]: ...
    def get_changes(self, org: str, project: str, repo: str, pr_number: int, commit_shas: list[str]) -> list[FileChange]: ...
    def get_work_item_criteria(self, org: str, project: str, ids: list[str]) -> dict[str, str]: ...
    def create_bug(self, org: str, project: str, title: str, repro_steps: str, severity: str, area_path: str, pr_number: int | None) -> str: ...
    def set_pr_status(self, org: str, project: str, repo: str, pr_number: int, state: str, description: str) -> None: ...
