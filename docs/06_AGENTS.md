# 06 · AI agents

Five AI steps. Each runs **inside Verity** with Azure OpenAI or Claude and returns one JSON object.

| Step | Key | Input (context) | Output | Applied as |
|---|---|---|---|---|
| Generate test cases | generate_test_cases | PR, linked work item acceptance criteria, commits + AI notes, changed files, diffs, regression suite | change_summary, modules (risk), test_cases, regression_suggestions | Cases TC-01…; Draft → Tests Generated |
| Regenerate | regenerate_test_cases | Same + current cases | Same | Keeps edited, manual and included-regression cases |
| Validate results | validate_results | Modules, commits, every case with result, actual, notes, evidence, bug | summary, result_consistency, evidence_gaps, failures_and_blocked | Findings; Submitted → AI Reviewed; score computed by Verity |
| Draft bug | draft_bug | Failed case, steps, actual, evidence | title, severity, area_path, repro_steps | Prefills the Create bug form |
| Find duplicates | find_duplicates | Regression suite | pairs {a, b, reason} | "Possible duplicate" flags + Merge |

## How a run works (`backend/app/ai/service.py`)
1. Build the prompt: same system prompt and context for both providers (`prompts.py`). Includes `run_id`, `task` and the JSON schema generated from `schemas.py`.
2. Call the provider:
   - **Azure OpenAI**: `response_format = json_schema`.
   - **Claude**: one forced tool call (`submit_result`) whose `input_schema` is the reply schema. Works with the Anthropic API or Claude on Microsoft Foundry (`CLAUDE_HOSTING`).
3. Check: Pydantic schema, `run_id`/`task` echo, every module / case / REG id exists.
4. If it fails, send the errors back and retry once. If it fails again, the run is stored as failed and the UI shows "Not imported" with the errors.
5. Store the run (prompt, reply, provider, model, tokens, who) and apply it.

## Readiness score
`100 − 8·fail − 6·blocked − 2·observations − 10·high-risk modules not verified − 2·N/A`, clamped 0–100. Verdict: P1 failure → "Not ready: a P1 case failed"; ≥80 → "Ready for UAT (with N observations)"; ≥65 → "Needs attention before UAT"; else "Not ready for UAT". The prototype sample (PR #482) scores **82 — Ready for UAT with 2 observations** (covered by tests).

## Demo provider
`AI_MODE=demo` returns the prototype's sample replies, built from the real context, so the full workflow runs without network or keys. Used by tests.
