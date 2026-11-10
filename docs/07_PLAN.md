# 07 · Plan

> The detailed, up-to-date version is **`/PLAN.md`** in the repo root. This page is the short summary kept for the standard docs structure.

## Phase 1 — done in this pass
- React app: all 9 screens + modals, audit drawer, toasts, walkthrough; pixel-identical to the prototype (verified by `npm run visual`); full workflow runs on demo data.
- FastAPI: models, Alembic migration, state machine, readiness score, AI service with Azure OpenAI + Claude providers, validation and retry, Azure DevOps client (on-behalf-of), GitHub client skeleton, evidence SAS URLs, all endpoints, seed, 9 tests (full PR #482 flow scores 82 through the API).

## Phase 2 — connect frontend to the API (next)
Order, one screen at a time, keeping the visual check green after each:
1. Entra app registrations (SPA + API), MSAL sign-in, `/me` → role. (10_AUTH)
2. Apps dashboard + Add App → `/apps`, `/ado/*`.
3. New cycle → `/apps/{id}/pull-requests`, `POST /cycles`, `POST /ai-runs {gen}`.
4. Review → case CRUD, suggestions, regenerate, `/users/testers`, assign.
5. Queue + execution → `/me/queue`, result PUT, evidence upload to Blob, bug.
6. Report → `/report`, validate run, approve / request changes; audit drawer → `/audit`.
7. Regression library endpoints.
Pattern: keep store action names; inside each action call `api.*` when `config.dataMode === 'api'`, then replace the cycle in the store with the server response.

## Phase 3 — product additions from the brief owner
- Tester Lead and Developer screens (backend roles exist).
- GitHub two-way sync (webhooks + `integrations/github.py`).
- Project templates for test-case generation (per-app template text injected into the generate prompt).
- Dev check-in release notes as an AI input (already parsed from `AI-Notes:` / `Release-Notes:` commit trailers).
- Notifications (email / Teams) on assign, submit, changes requested, approval.

## Phase 4 — hardening
Background worker for AI runs (arq/Celery) with progress streaming, rate limits, Application Insights, backups, pen test.
