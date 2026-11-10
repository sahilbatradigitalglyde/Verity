# 04 · Database

PostgreSQL in production, SQLite for local development. Migrations with Alembic (`alembic upgrade head`).

| Table | Purpose | Key columns |
|---|---|---|
| users | People and their Verity role | email, entra_oid, role (developer, senior_developer, tester, tester_lead, admin) |
| apps | Linked repositories | id (slug), provider (azure_devops/github), org, project, repo, target_branch, approve_threshold, ai_modes (per step), ai_inputs |
| cycles | One per PR or release under test | app_id, pr_number, commits (JSON), files (JSON), work_items, status, summary, modules (JSON: id, name, risk, desc), suggestions, tester_id, due, change_comment, approved_* |
| test_cases | Cases and their result | cycle_id, key (TC-01), title, type, priority, module, source (diff/notes/reg/manual), steps (JSON), expected, edited, promoted, status (pass/fail/blocked/na), actual, notes, bug, checked_steps |
| evidence | Files attached to a result | case_id, file_name, blob_name, size |
| ai_runs | Every AI call | id (VR-482-GEN-001), task, provider, model, prompt, reply (JSON), raw_reply, errors, attempts, status, tokens, started_by |
| regression_cases | Regression library per app | id (REG-118), module, priority, last_run, last_result, history (10 chars P/F/B/N), tags, duplicate_of, archived |
| audit_events | Append-only audit trail | cycle_id, actor_id, actor_kind (user/ai/system), action, detail, tag, category, created_at |

Readiness is **not stored**; it is computed from `test_cases` + the latest successful `validate` run, so it can never drift.
