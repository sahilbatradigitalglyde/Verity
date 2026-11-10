"""Reply formats for each AI step. Both providers must return exactly these shapes.
The JSON schema sent to the model is generated from these models, and replies are validated against them.
"""
from typing import Literal

from pydantic import BaseModel, Field

Task = Literal["gen", "regen", "validate", "bug", "dups"]
TASK_KEYS: dict[str, str] = {
    "gen": "generate_test_cases", "regen": "regenerate_test_cases", "validate": "validate_results",
    "bug": "draft_bug", "dups": "find_duplicates",
}
TASK_NAMES: dict[str, str] = {
    "gen": "Generate test cases", "regen": "Regenerate test cases", "validate": "AI validation report",
    "bug": "Draft bug report", "dups": "Find duplicate regression cases",
}


class Envelope(BaseModel):
    run_id: str
    task: str
    schema_version: Literal["1.0"] = "1.0"


class ModuleOut(BaseModel):
    id: str = Field(description="Short id, e.g. 'settle'")
    name: str
    risk: Literal["High", "Medium", "Low"]
    description: str = Field(description="Why this risk level, one sentence")


class CaseOut(BaseModel):
    title: str
    type: Literal["Functional", "Edge case", "Negative", "Regression"]
    priority: Literal["P1", "P2", "P3"]
    module: str = Field(description="An id from modules")
    linked_file: str
    source: Literal["diff", "notes", "reg"]
    preconditions: str
    steps: list[str] = Field(min_length=1)
    expected_result: str


class SuggestionOut(BaseModel):
    regression_id: str
    reason: str


class GenerateReply(Envelope):
    change_summary: str = Field(description="Plain-language summary, 2 to 4 sentences")
    modules: list[ModuleOut] = Field(min_length=1)
    test_cases: list[CaseOut] = Field(min_length=1)
    regression_suggestions: list[SuggestionOut] = []


class CaseFinding(BaseModel):
    case_id: str
    reason: str


class CaseExplanation(BaseModel):
    case_id: str
    explanation: str


class ValidateReply(Envelope):
    summary: str
    result_consistency: list[CaseFinding]
    evidence_gaps: list[CaseFinding]
    failures_and_blocked: list[CaseExplanation]


class BugReply(Envelope):
    title: str = Field(max_length=120)
    severity: Literal["1 - Critical", "2 - High", "3 - Medium", "4 - Low"]
    area_path: str
    repro_steps: str


class DupPair(BaseModel):
    a: str
    b: str
    reason: str


class DupsReply(Envelope):
    pairs: list[DupPair]


REPLY_MODEL: dict[str, type[Envelope]] = {
    "gen": GenerateReply, "regen": GenerateReply, "validate": ValidateReply, "bug": BugReply, "dups": DupsReply,
}
