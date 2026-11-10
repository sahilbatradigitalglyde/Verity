"""Cycle workflow state machine.

Draft → Tests Generated → Assigned → In Testing → Submitted → AI Reviewed → Approved for UAT
AI Reviewed → Changes Requested → In Testing (loop)

Every transition is checked here so the API can never put a cycle into an invalid state.
"""
from fastapi import HTTPException, status

from app.models import CycleStatus as S, Role

# (from, to) -> roles allowed to trigger it ("system" = Verity itself, e.g. after an AI run)
TRANSITIONS: dict[tuple[S, S], set[Role | str]] = {
    (S.draft, S.tests_generated): {Role.senior_developer},
    (S.tests_generated, S.assigned): {Role.senior_developer, Role.tester_lead},
    (S.assigned, S.in_testing): {Role.tester},
    (S.changes_requested, S.in_testing): {Role.tester},
    (S.in_testing, S.submitted): {Role.tester},
    (S.submitted, S.ai_reviewed): {Role.senior_developer, "system"},
    (S.ai_reviewed, S.approved): {Role.senior_developer},
    (S.ai_reviewed, S.changes_requested): {Role.senior_developer},
}

FLOW = [S.draft, S.tests_generated, S.assigned, S.in_testing, S.submitted, S.ai_reviewed, S.approved]

# The tester can change results only in these states
TESTER_EDITABLE = {S.assigned, S.in_testing, S.changes_requested}
# The senior developer can edit cases only here
CASES_EDITABLE = {S.tests_generated}


def can_transition(frm: S, to: S, actor: Role | str) -> bool:
    allowed = TRANSITIONS.get((frm, to))
    if allowed is None:
        return False
    return actor == Role.admin or actor in allowed


def transition(cycle, to: S, actor: Role | str) -> str:
    """Moves the cycle and returns the audit tag, e.g. 'Assigned → In Testing'."""
    frm = cycle.status
    if not can_transition(frm, to, actor):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot move a cycle from {frm.value} to {to.value}")
    cycle.status = to
    return f"{frm.value} → {to.value}"
