import pytest
from fastapi import HTTPException

from app.models import CycleStatus as S, Role
from app.services.workflow import can_transition, transition


class C:
    def __init__(self, s):
        self.status = s


def test_happy_path_and_loop():
    c = C(S.draft)
    for to, who in [(S.tests_generated, Role.senior_developer), (S.assigned, Role.senior_developer), (S.in_testing, Role.tester),
                    (S.submitted, Role.tester), (S.ai_reviewed, "system"), (S.changes_requested, Role.senior_developer),
                    (S.in_testing, Role.tester), (S.submitted, Role.tester), (S.ai_reviewed, "system"), (S.approved, Role.senior_developer)]:
        transition(c, to, who)
    assert c.status == S.approved


def test_invalid_moves_are_rejected():
    assert not can_transition(S.draft, S.approved, Role.senior_developer)
    assert not can_transition(S.ai_reviewed, S.approved, Role.tester)
    with pytest.raises(HTTPException):
        transition(C(S.assigned), S.submitted, Role.tester)
