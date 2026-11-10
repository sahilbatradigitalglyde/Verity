"""Database models. One cycle = one PR (or release) under test; cases, results, AI runs and audit hang off it."""
from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def uid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    developer = "developer"
    senior_developer = "senior_developer"
    tester = "tester"
    tester_lead = "tester_lead"
    admin = "admin"


class CycleStatus(str, enum.Enum):
    draft = "Draft"
    tests_generated = "Tests Generated"
    assigned = "Assigned"
    in_testing = "In Testing"
    submitted = "Submitted"
    ai_reviewed = "AI Reviewed"
    approved = "Approved for UAT"
    changes_requested = "Changes Requested"


class ResultStatus(str, enum.Enum):
    none = ""
    passed = "pass"
    failed = "fail"
    blocked = "blocked"
    na = "na"


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    entra_oid: Mapped[str | None] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    initials: Mapped[str] = mapped_column(String(4))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class App(Base):
    __tablename__ = "apps"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # slug, e.g. "claims"
    name: Mapped[str] = mapped_column(String(200))
    initials: Mapped[str] = mapped_column(String(4))
    provider: Mapped[str] = mapped_column(String(20), default="azure_devops")  # azure_devops | github
    org: Mapped[str] = mapped_column(String(200))
    project: Mapped[str] = mapped_column(String(200))
    repo: Mapped[str] = mapped_column(String(200))
    target_branch: Mapped[str] = mapped_column(String(200), default="main")
    default_tester_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    approve_threshold: Mapped[int] = mapped_column(Integer, default=75)
    # per-step provider: {"gen": "ask"|"azure"|"claude", ...}
    ai_modes: Mapped[dict] = mapped_column(JSON, default=lambda: {"gen": "ask", "regen": "ask", "validate": "ask", "bug": "ask", "dups": "ask"})
    ai_inputs: Mapped[dict] = mapped_column(JSON, default=lambda: {"diffs": True, "commit_notes": True, "work_items": True, "regression": True})
    modules: Mapped[list] = mapped_column(JSON, default=list)  # [{id, name, risk, desc}] per-app module vocabulary
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def path(self) -> str:
        return f"{self.org} / {self.project} / {self.repo}"


class Cycle(Base):
    __tablename__ = "cycles"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    version: Mapped[int] = mapped_column(Integer, default=1)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id"), index=True)
    name: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(20), default="pr")  # pr | release
    pr_number: Mapped[int | None] = mapped_column(Integer)
    pr_numbers: Mapped[list] = mapped_column(JSON, default=list)  # all PR numbers (release cycles have >1)
    pr_title: Mapped[str] = mapped_column(String(300), default="")
    source_branch: Mapped[str] = mapped_column(String(200), default="")
    target_branch: Mapped[str] = mapped_column(String(200), default="main")
    authors: Mapped[list] = mapped_column(JSON, default=list)
    commits: Mapped[list] = mapped_column(JSON, default=list)   # [{hash, message, author, ai_note, files}]
    files: Mapped[list] = mapped_column(JSON, default=list)     # [{status, path, added, removed}]
    work_items: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[CycleStatus] = mapped_column(Enum(CycleStatus, native_enum=False, values_callable=lambda e: [x.value for x in e]), default=CycleStatus.draft)
    summary: Mapped[str] = mapped_column(Text, default="")
    modules: Mapped[list] = mapped_column(JSON, default=list)   # [{id, name, risk, desc}]
    suggestions: Mapped[list] = mapped_column(JSON, default=list)  # [{regression_id, reason}]
    tester_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    due: Mapped[date | None] = mapped_column(Date)
    change_comment: Mapped[str] = mapped_column(Text, default="")
    approved_note: Mapped[str] = mapped_column(Text, default="")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    app: Mapped[App] = relationship()
    tester: Mapped[User | None] = relationship(foreign_keys=[tester_id])
    cases: Mapped[list[TestCase]] = relationship(back_populates="cycle", order_by="TestCase.position", cascade="all, delete-orphan")
    ai_runs: Mapped[list[AiRun]] = relationship(back_populates="cycle", order_by="AiRun.created_at", cascade="all, delete-orphan")


class TestCase(Base):
    __tablename__ = "test_cases"
    __table_args__ = (UniqueConstraint("cycle_id", "key"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    cycle_id: Mapped[str] = mapped_column(ForeignKey("cycles.id"), index=True)
    key: Mapped[str] = mapped_column(String(16))       # TC-01
    version: Mapped[int] = mapped_column(Integer, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(400))
    type: Mapped[str] = mapped_column(String(20))      # Functional | Edge case | Negative | Regression
    priority: Mapped[str] = mapped_column(String(4))   # P1 | P2 | P3
    linked_file: Mapped[str] = mapped_column(String(400), default="")
    source: Mapped[str] = mapped_column(String(10))    # diff | notes | reg | manual
    module: Mapped[str] = mapped_column(String(64))
    preconditions: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(JSON, default=list)
    expected: Mapped[str] = mapped_column(Text, default="")
    edited: Mapped[bool] = mapped_column(Boolean, default=False)
    promoted: Mapped[bool] = mapped_column(Boolean, default=False)
    regression_id: Mapped[str | None] = mapped_column(String(32))  # set when included from / promoted to the suite
    # result
    status: Mapped[ResultStatus] = mapped_column(Enum(ResultStatus, native_enum=False, values_callable=lambda e: [x.value for x in e]), default=ResultStatus.none)
    actual: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    bug: Mapped[str] = mapped_column(String(40), default="")
    checked_steps: Mapped[list] = mapped_column(JSON, default=list)
    recorded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cycle: Mapped[Cycle] = relationship(back_populates="cases")
    evidence: Mapped[list[Evidence]] = relationship(cascade="all, delete-orphan", order_by="Evidence.created_at")


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("test_cases.id"), index=True)
    file_name: Mapped[str] = mapped_column(String(400))
    blob_name: Mapped[str] = mapped_column(String(600))
    size: Mapped[int | None] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(100), default="")
    uploaded_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AiRun(Base):
    """Every AI call is stored with its prompt, reply, provider and who ran it."""
    __tablename__ = "ai_runs"
    id: Mapped[str] = mapped_column(String(48), primary_key=True)  # VR-482-GEN-001
    cycle_id: Mapped[str | None] = mapped_column(ForeignKey("cycles.id"), index=True)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id"))
    task: Mapped[str] = mapped_column(String(32))     # gen | regen | validate | bug | dups
    provider: Mapped[str] = mapped_column(String(16)) # azure | claude
    model: Mapped[str] = mapped_column(String(100), default="")
    prompt: Mapped[str] = mapped_column(Text)
    reply: Mapped[dict | None] = mapped_column(JSON)
    raw_reply: Mapped[str] = mapped_column(Text, default="")
    errors: Mapped[list] = mapped_column(JSON, default=list)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="running")  # running | succeeded | failed
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    started_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cycle: Mapped[Cycle | None] = relationship(back_populates="ai_runs")


class RegressionCase(Base):
    __tablename__ = "regression_cases"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # REG-118
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id"), index=True)
    title: Mapped[str] = mapped_column(String(400))
    module: Mapped[str] = mapped_column(String(100))
    priority: Mapped[str] = mapped_column(String(4))
    preconditions: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(JSON, default=list)
    expected: Mapped[str] = mapped_column(Text, default="")
    last_run: Mapped[str] = mapped_column(String(20), default="Not run")
    last_result: Mapped[str] = mapped_column(String(10), default="Not run")
    history: Mapped[str] = mapped_column(String(10), default="NNNNNNNNNN")  # last 10 runs, P/F/B/N
    source_cycle: Mapped[str] = mapped_column(String(100), default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    duplicate_of: Mapped[str] = mapped_column(String(32), default="")
    duplicate_reason: Mapped[str] = mapped_column(Text, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class AiJob(Base):
    """Tracks the progress of an asynchronous AI task."""
    __tablename__ = "ai_jobs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    task: Mapped[str] = mapped_column(String(32))
    provider: Mapped[str] = mapped_column(String(16))
    cycle_id: Mapped[str | None] = mapped_column(ForeignKey("cycles.id"), index=True)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id"))
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|running|succeeded|failed
    step: Mapped[int] = mapped_column(Integer, default=0)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    result: Mapped[dict | None] = mapped_column(JSON)
    ai_run_id: Mapped[str | None] = mapped_column(String(48))
    error: Mapped[str] = mapped_column(Text, default="")
    started_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    """Append-only. Never updated or deleted."""
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cycle_id: Mapped[str | None] = mapped_column(ForeignKey("cycles.id"), index=True)
    app_id: Mapped[str | None] = mapped_column(ForeignKey("apps.id"))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_kind: Mapped[str] = mapped_column(String(10), default="user")  # user | ai | system
    action: Mapped[str] = mapped_column(Text)
    detail: Mapped[str] = mapped_column(Text, default="")
    tag: Mapped[str] = mapped_column(String(100), default="")
    tag_class: Mapped[str] = mapped_column(String(16), default="p-ac")
    category: Mapped[str] = mapped_column(String(20), default="Workflow")  # Workflow | Test cases | Results | AI runs | Approvals
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
