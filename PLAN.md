# Verity: plan from prototype to a working product

**Owner:** Saahil (Product Owner / PM) · **Built with:** Claude Code in VS Code · **Last updated:** 4 Nov 2026

This is the master plan. `ARCHITECTURE.md` explains how the system is built, `PREREQUISITES.md` lists the access you have to request, `DECISIONS.md` logs decisions, and `CLAUDE.md` holds the rules Claude Code follows in this repo.

---

## Where we are today

| Area | Status |
|---|---|
| UI | ✅ All 9 screens in React, pixel-identical to the prototype (visual check in `docs/13_TESTING.md`) |
| Behaviour | ✅ Full workflow works, but only on **in-browser sample data** (PR #482, Claims Portal). A refresh resets everything. |
| Backend | ✅ FastAPI, database, workflow rules, readiness score, AI service (Azure OpenAI + Claude), Azure DevOps client, 9 passing tests |
| Connection | ❌ The screens do not call the backend yet |
| Real services | ❌ No Entra sign-in, no live Azure DevOps, no live AI, no file storage, not deployed |

## What "working like a real project" means

1. People sign in with their Microsoft work account and get their role automatically.
2. An admin links **any** Azure DevOps repo (later GitHub). It appears on the dashboard with real numbers.
3. A senior developer picks real PRs. AI reads the real diff and drafts test cases. The developer curates and assigns them.
4. The tester sees the cycle in their queue, records results, uploads real screenshots and logs, and creates real Azure DevOps bugs.
5. AI validates the results. The senior developer approves, and the PR in Azure DevOps shows `verity/uat-ready`.
6. Everything is saved, survives refresh, is audited, and runs on Azure for the whole team.

---

## Phases at a glance

| # | Phase | Outcome | Rough effort* |
|---|---|---|---|
| 0 | Foundations | Git, CI, environments, access requested | 2–3 days (plus admin wait) |
| 1 | Backend completion | Every action the UI needs exists in the API, including background AI jobs | 5–7 days |
| 2 | Connect the UI (remove hard-coding) | Every screen reads and writes real data; refresh keeps state | 8–10 days |
| 3 | Real sign-in and roles | Entra ID login, role from groups, permission-aware screens | 3–4 days |
| 4 | Live Azure DevOps | Real repos, PRs, diffs, work items, bugs, PR status, service hooks | 5–6 days |
| 5 | Live AI | Azure OpenAI + Claude on real PRs, large-diff handling, cost tracking, quality checks | 4–5 days |
| 6 | Evidence, notifications, regression runs | Blob uploads and previews, email/Teams, "Run regression suite" | 4–5 days |
| 7 | Product additions | Tester Lead + Developer screens, project templates, release cycles, GitHub sync | 8–12 days |
| 8 | Hardening and deployment | Security, performance, monitoring, Azure deployment via pipeline | 5–7 days |
| 9 | Pilot and go-live | One real app with real testers, fixes, launch | 2 weeks |

\*One developer working with Claude Code; treat these as planning estimates, not commitments. Phases 0 and 3–5 depend on access from your Azure admin, so request it on day 1 (`PREREQUISITES.md`).

**Critical path:** 0 → 1 → 2 → 3 → 4 → 5 → 8 → 9. Phases 6 and 7 can run in parallel once 2 is done.

---

## How to work each task (the loop)

1. Create a branch: `git checkout -b phase2/apps-dashboard`.
2. Give Claude Code the prompt listed under the task (it reads `CLAUDE.md` automatically).
3. Check the result yourself in the browser.
4. Run the checks:
   ```powershell
   cd backend;  pytest
   cd ..\frontend;  npm run build
   npm run visual -- ..\docs\reference\verity-prototype.html http://localhost:4173   # UI tasks only
   ```
5. Commit, open a PR in Azure DevOps, merge. Tick the box in this file.

**Definition of done (every task):** works end to end in the browser · tests added or updated and passing · visual check still green for UI tasks · audit events written for any change of data · docs updated if behaviour or API changed.

---

## Phase 0: Foundations

- [ ] **0.1 Git and repo.** `git init`, first commit, push to a new Azure DevOps repo `verity`. Protect `main` (PR required, build must pass).
- [ ] **0.2 CI pipeline.** `azure-pipelines.yml` (included) runs backend tests and the frontend build on every PR. Create the pipeline in Azure DevOps from this file.
- [ ] **0.3 Local PostgreSQL.** Run Postgres locally (Docker Desktop or a dev instance) and set `DATABASE_URL`. SQLite stays fine for tests.
- [ ] **0.4 Request access.** Send `PREREQUISITES.md` to your Azure admin on day 1. Nothing in phases 3–5 can go live without it.
- [ ] **0.5 Environments.** Agree on three: `local`, `dev` (shared, Azure) and `prod`.

**Done when** CI is green on `main` and the admin request is sent.

---

## Phase 1: Backend completion

The API covers the core workflow already. These gaps must close before the UI can run fully on real data.

- [x] **1.1 Background AI jobs.** AI runs are currently synchronous (the request waits). Add an `ai_jobs` flow: `POST /ai-runs` returns `{job_id}` immediately; a worker runs the task; `GET /ai-jobs/{id}` returns `{status, step, steps[], result|error}`. This drives the existing step-by-step "busy" overlay. Start with FastAPI background tasks; move to a queue (`arq` + Redis) in phase 8.
  > *Prompt:* "Read ARCHITECTURE.md §5.3. Make AI runs asynchronous: add an ai_jobs table, return a job id from POST /cycles/{id}/ai-runs and /apps/{id}/regression/scan-duplicates, run the task in a background task that updates the current step, and add GET /ai-jobs/{id}. Keep run_task() unchanged. Update tests."
- [x] **1.2 Optimistic concurrency.** Add a `version` column to cycles and test cases, require `If-Match` on writes, and return 409 on conflicts (two people editing the same case).
- [x] **1.3 Soft delete and undo.** Deleting a case sets `deleted_at`; `POST /cases/{key}/restore` powers the Undo toast.
- [x] **1.4 Cycle list with filters and pagination.** `GET /apps/{id}/cycles?status=&tester=&q=&page=` for the App detail table.
- [x] **1.5 Regression suite pagination and server search.** Real suites have hundreds of cases.
- [x] **1.6 Per-app module mapping.** Replace the hard-coded `MODULE_TO_SUITE` (Claims only) with a per-app module list saved in settings and suggested by AI.
- [x] **1.7 Release cycles.** Allow several PRs in one cycle (`kind=release`), with commits and files merged across PRs.
- [x] **1.8 Dashboard stats.** Pass rate over the last 30 days and last approval date, computed in SQL and cached.
- [x] **1.9 Seed for local development.** Keep the prototype sample (Claims Portal + PR #482) as `python -m app.seed --demo` so demos and the visual check still work.

**Done when** every button in the UI has a matching endpoint (checklist in `docs/09_FEATURES.md`) and `pytest` covers it.

---

## Phase 2: Connect the UI and remove hard-coding

**Approach.** Keep the screens and CSS exactly as they are. Replace the data underneath:

1. Add a data layer: `src/api/client.ts` (exists) plus **TanStack Query** for loading, caching and refetching server data.
2. Routes use real ids: `/cycle/482/review` becomes `/cycles/:cycleId/review`; `/app/claims` becomes `/apps/:appId`.
3. Each store action calls the API when `VITE_MODE_DATA=api`, then updates the cache from the server response. Demo mode keeps working for the visual check.
4. Replace every hard-coded value with data from the API. Today these are hard-coded:

| Hard-coded today | Where | Replace with |
|---|---|---|
| "PR #482", title, authors, "6 commits · 19 files", branch | `Shell.tsx` (CycleHead), Review, Run, Report, Overlays, store | `cycle.pr_number`, `pr_title`, `authors`, `commit_count`, `file_count`, `source_branch` |
| "Claims Portal", `claims` | Shell, AppDetail, Apps, NewCycle, Queue, Review, Overlays | `app.name`, `app.id` |
| Daniel Okafor / Priya Shah / Marcus Lee | NewCycle, Queue, Report, Run, Review, Settings, store | current user (`/me`), `cycle.tester`, approver, people picker (`/users/testers`) |
| `PRS`, `FILES`, `MODS`, `TPL`, `SUGG`, `SAMPLE`, `ADO`, `STATIC_CYCLES` from `data/demo.ts` | NewCycle, Review, AppDetail, Overlays, store, `ai/tasks.ts` | API responses (demo data stays only for demo mode) |
| Sample queue rows | `Queue.tsx` | `GET /me/queue` |
| Sample cycle rows | `AppDetail.tsx` | `GET /apps/{id}/cycles` |
| "contoso-health / Claims" in bug modal | Overlays (BugModal) | app org/project |

**Tasks, one screen per PR, in this order:**

- [x] **2.1 Data layer and routing.** Add TanStack Query, the API base URL, `X-Demo-User` dev auth (until phase 3), and routes with ids.
  > *Prompt:* "Read PLAN.md phase 2 and ARCHITECTURE.md §6. Add TanStack Query and switch routes to ids (/apps/:appId, /cycles/:cycleId/review|run|report). In api mode, send X-Demo-User from a dev role picker. Demo mode must behave exactly as now. No markup or CSS changes."
- [x] **2.2 Apps dashboard and Add App** → `GET /apps`, `GET /ado/*`, `POST /apps`.
- [ ] **2.3 App detail: cycles table and Settings** → `GET /apps/{id}`, `/apps/{id}/cycles`, `PATCH /apps/{id}/settings`.
- [ ] **2.4 New test cycle** → `GET /apps/{id}/pull-requests`, `POST /apps/{id}/cycles`, then AI job `gen` with progress overlay → navigate to `/cycles/{id}/review`.
- [ ] **2.5 Test case review** → case create/edit/duplicate/delete+undo/promote, suggestions, regenerate job, `/users/testers` people picker, assign.
- [ ] **2.6 Tester queue** → `GET /me/queue` with Open / Submitted / Completed tabs.
- [ ] **2.7 Execution** → result PUT (debounced autosave), step checks, evidence (phase 6 completes uploads), bug draft job + create bug, submit.
- [ ] **2.8 AI report** → validate job, `GET /report`, approve (threshold + confirmation), request changes, re-run.
- [ ] **2.9 Regression library** → list/search/filter/paginate, tag, archive, export, scan job, merge.
- [ ] **2.10 Audit drawer** → `GET /cycles/{id}/audit`, filters, CSV export.
- [ ] **2.11 Error and empty states.** Show API errors in the existing toast and banner styles (403 role, 409 state, 422 AI "Not imported", 503 provider not configured).

**Done when** you can run the whole PR #482 flow in **api mode** with two browsers (dev and tester), refresh at any point without losing anything, and the visual check is still green in demo mode.

---

## Phase 3: Real sign-in and roles

Needs the Entra app registrations from `PREREQUISITES.md` §1.

- [ ] **3.1 MSAL sign-in** (`src/auth/msal.ts` exists): redirect flow, token on every API call, silent refresh, sign-out.
- [ ] **3.2 Roles from Entra groups** (`ENTRA_GROUP_ROLE_MAP`). First login creates the user.
- [ ] **3.3 Permission-aware UI.** Hide the "Viewing as" switcher in api mode. Show and hide buttons by role using the matrix in `docs/10_AUTH.md` (the API already enforces it).
- [ ] **3.4 Admin › Users page** (small, new): list users, role, last sign-in. Roles are still managed by Entra groups.
- [ ] **3.5 Turn off `AUTH_DEV_BYPASS`** in every shared environment.

**Done when** a real colleague signs in, lands on the right home page for their role, and gets 403 for anything outside it.

---

## Phase 4: Live Azure DevOps

- [ ] **4.1 On-behalf-of token flow** working with your tenant (`integrations/azure_devops.py`).
- [ ] **4.2 Add App picker** shows real orgs, projects and repos the user can access.
- [ ] **4.3 Pull requests and commits** for the app's target branch, including work items and AI commit / release notes (`AI-Notes:` / `Release-Notes:` trailers; agree the format with developers, see `DECISIONS.md`).
- [ ] **4.4 Real diffs.** Fetch changed files with line counts and unified diffs (currently stubbed at 0/0). Skip binaries, lockfiles and generated files.
- [ ] **4.5 Work item acceptance criteria** passed to the AI.
- [ ] **4.6 Create bug** in the right project and area path, linked to the PR, with evidence attached.
- [ ] **4.7 PR status `verity/uat-ready`.** Set to `pending` when a cycle starts, `succeeded` on approval, `failed` on changes requested.
- [ ] **4.8 Service hooks.** "Pull request updated" (new commits) → warn on the cycle ("PR changed after tests were generated") and offer Regenerate. Secure the webhook with a shared secret.

**Done when** you link a real repo, create a cycle from a real PR, file a real bug and see the status check on the PR.

---

## Phase 5: Live AI

- [ ] **5.1 Configure both providers** (keys from `PREREQUISITES.md` §3) and run every AI step on a real PR with each.
- [ ] **5.2 Large diffs.** Budget the context: rank files by risk (source over tests/docs), truncate long diffs, summarise very large PRs per module first, and show "AI read 42 of 60 files" on the review screen.
- [ ] **5.3 Project templates.** Per-app instructions for test generation (domain terms, environments, test data, house style), injected into the generate prompt. New Settings section.
- [ ] **5.4 Quality set.** Save 5–10 real PRs with "good" expected cases, and run both providers against them before changing prompts (`backend/tests/ai_eval/`).
- [ ] **5.5 Cost and usage.** Token counts are stored per run already; add a small usage view per app and month.
- [ ] **5.6 Data safety.** Strip secrets (keys, connection strings) from diffs before sending; follow the client approval in `DECISIONS.md`.

**Done when** both providers produce importable results on real PRs at least 95% of the time on the quality set, with failures shown as "Not imported" and retryable.

---

## Phase 6: Evidence, notifications, regression runs

- [ ] **6.1 Evidence uploads** straight to Blob via SAS (endpoint exists); progress bar; image thumbnails; open/download links; 200 MB limit; virus scan via Defender for Storage.
- [ ] **6.2 Notifications.** Email (Microsoft Graph) and Teams (incoming webhook or bot) on assigned, changes requested, submitted, AI reviewed and approved. Per-user preferences later.
- [ ] **6.3 Run regression suite.** Pick regression cases (filter or tag) → creates a `kind=regression` cycle that goes through the same assign → execute → validate flow; results update each case's history sparkline.
- [ ] **6.4 Exports.** Cycle report as PDF for the client, audit CSV (exists), regression CSV (exists).

---

## Phase 7: Product additions

- [ ] **7.1 Tester Lead** screens: all testers' queues, reassign, workload view. (Backend role exists.)
- [ ] **7.2 Developer** read-only view: cycles for my PRs, results and bugs.
- [ ] **7.3 Release cycles UI:** select several PRs in New cycle (backend from 1.7).
- [ ] **7.4 GitHub two-way sync:** finish `integrations/github.py`, GitHub App auth, webhooks; App provider choice in Add App.
- [ ] **7.5 Dashboard trends:** pass rate over time, cycle time per stage, defects per app.

New screens must follow the prototype's design system (same CSS classes and tokens). Mock them in the prototype file first, get sign-off, then build.

---

## Phase 8: Hardening and deployment

- [ ] **8.1 Security:** RBAC tests for every endpoint, input limits, rate limiting, secure headers, dependency scanning, secrets only in Key Vault.
- [ ] **8.2 Performance:** pagination everywhere, DB indexes, AI jobs on a queue (`arq` + Azure Cache for Redis).
- [ ] **8.3 Observability:** Application Insights (API, frontend, AI run durations and failures), alerts for failed AI runs and webhook errors.
- [ ] **8.4 End-to-end tests:** Playwright runs the full flow in api mode against a test database in CI.
- [ ] **8.5 Azure deployment** (`ARCHITECTURE.md` §8): Static Web App (frontend), Container Apps (API + worker), PostgreSQL Flexible Server, Blob, Key Vault, migrations in the pipeline, dev → prod promotion.
- [ ] **8.6 Backups and retention:** daily DB backups, evidence retention policy, audit kept for 7 years (confirm with the client).

---

## Phase 9: Pilot and go-live

- [ ] **9.1 Pilot** with one real app and team for 2 weeks (one senior developer, two testers).
- [ ] **9.2 Feedback triage:** fix blockers, log the rest.
- [ ] **9.3 Go-live checklist:** sign-in for all users, roles mapped, AI providers approved, backups on, alerts on, support contact in the sign-in screen.
- [ ] **9.4 Handover docs:** user guide per role, admin guide.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Admin access (Entra, Azure DevOps consent, AI keys) is slow | Phases 3–5 blocked | Request on day 1; keep working in dev-bypass + demo AI |
| Client won't allow code to be sent to an AI provider | AI features unusable for that client | Per-app AI on/off; Claude on Microsoft Foundry keeps data in your Azure tenant |
| Very large PRs exceed the model context | Poor or failed generation | Phase 5.2 budgeting and per-module summaries |
| UI drifts from the prototype during wiring | Boss rejects | Visual check required on every UI PR (`CLAUDE.md`) |
| AI marks results as consistent when they aren't | False confidence | Report is advisory; approval needs explicit confirmation; quality set in 5.4 |
