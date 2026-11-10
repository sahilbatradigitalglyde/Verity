"""Prompt templates. Identical for Azure OpenAI and Claude, so both providers produce the same report format."""
from __future__ import annotations

import json

from app.ai.schemas import REPLY_MODEL, TASK_KEYS, TASK_NAMES

ROLE = {
    "gen": "You are a senior QA engineer. Read the pull request below and (1) summarize what changed in plain language, (2) group the changes by module with a risk level (High, Medium or Low) and a one-sentence reason, (3) write test cases a manual tester can run (functional, edge case, negative and regression), each with preconditions, numbered steps and one expected result, and (4) pick related cases from the existing regression suite with a reason for each. Prefer fewer, sharper cases over many vague ones. Every High-risk module needs at least one P1 case.",
    "regen": "You are a senior QA engineer. Regenerate the full list of test cases for the pull request below, following the same rules as a first generation. The reviewer has already edited or added some cases (listed under Current cases). Verity keeps those automatically, so focus on gaps and do not repeat them.",
    "validate": "You are reviewing a tester’s results before a release goes to the client for UAT. You do not re-run tests. Check (1) result consistency: cases marked Pass whose actual result does not fully support the expected result, (2) evidence gaps: P1 cases marked Pass with no evidence, and (3) for every Fail or Blocked case, the likely cause and the risk of approving anyway, citing commits or modules where relevant. Coverage and the readiness score are calculated by Verity from the results, so do not output a score.",
    "bug": "Write an Azure DevOps bug for the failed test case below. Title under 90 characters. Repro steps as numbered lines, then Expected and Actual. Choose a severity: 1 - Critical, 2 - High, 3 - Medium or 4 - Low.",
    "dups": "Find regression cases that test the same behavior and should be merged. Only flag a pair when one case would be redundant if the other runs. Give a one-sentence reason for each pair.",
}

RULES = [
    "Reply with exactly one JSON object matching the required format. No other text.",
    "Copy run_id and task exactly as given. Verity rejects replies whose run_id does not match.",
    "Use only files, modules, case IDs and regression IDs that appear in the context. Do not invent them.",
    "If the context is not enough to judge something, say so in the text field instead of guessing.",
    "Use plain language and short sentences.",
]


def json_schema(task: str) -> dict:
    return REPLY_MODEL[task].model_json_schema()


def system_prompt(task: str) -> str:
    return "\n".join(["## Your role", ROLE[task], "", "## Output rules", *[f"- {r}" for r in RULES]])


def user_prompt(task: str, run_id: str, app_label: str, context: list[str]) -> str:
    head = [
        f"# Verity AI task: {TASK_NAMES[task]}", "",
        f"- run_id: {run_id}", f"- task: {TASK_KEYS[task]}", "- schema_version: 1.0", f"- app: {app_label}", "",
        "## Required output format (JSON Schema)", "```json", json.dumps(json_schema(task), indent=2), "```", "",
        "## Context",
    ]
    return "\n".join(head + context)


def retry_prompt(errors: list[str]) -> str:
    return "Your previous reply could not be imported:\n" + "\n".join(f"- {e}" for e in errors) + "\nReply again with the corrected JSON only."
