# Verity architecture

Target architecture for the working product. **Status** marks what exists today (✅), what is partial (◐) and what is planned (○). Section numbers are referenced from `PLAN.md`.

---

## 1. System overview

```
                    ┌──────────────────────────── Microsoft Entra ID ─────────────────────────────┐
                    │  sign-in (MSAL)              token validation · groups → roles · OBO token  │
                    └───────▲───────────────────────────────▲─────────────────────────────▲────────┘
                            │                               │                             │
┌───────────────────────────┴──────┐  HTTPS + bearer  ┌──────┴──────────────────────┐      │ on-behalf-of
│ Web app (React + TS, Vite)       │ ───────────────► │ Verity API (FastAPI)        │──────┘
│ Azure Static Web Apps            │ ◄─────────────── │ Azure Container Apps        │──────────► Azure DevOps REST
│ • 9 screens, pixel = prototype   │   JSON           │ • routers → services        │            (repos, PRs, diffs,
│ • TanStack Query cache           │                  │ • workflow state machine    │             work items, bugs,
│ • polls AI job progress          │                  │ • readiness score           │             PR status)
└───────────┬──────────────────────┘                  │ • audit                     │◄────────── Service hooks
            │ direct upload (SAS URL)                 └───┬─────────┬───────────┬───┘            (PR updated)
            ▼                                             │         │ enqueue   │
┌──────────────────────────┐                              │         ▼           │
│ Azure Blob Storage       │◄─────── SAS ─────────────────┤   ┌──────────────┐  │
│ evidence (screenshots,   │                              │   │ AI worker    │──┼──► Azure OpenAI
│ logs, videos)            │                              │   │ (arq)        │──┼──► Claude (Anthropic API
└──────────────────────────┘                              │   └──────┬───────┘  │      or Microsoft Foundry)
                                                          ▼          ▼          ▼
                                           ┌──────────────────────────┐  ┌─────────────────────┐
                                           │ PostgreSQL Flexible      │  │ Key Vault · App     │
                                           │ apps · cycles · cases ·  │  │ Insights · Redis    │
                                           │ ai_runs · audit · …      │  │ (queue)             │
                                           └──────────────────────────┘  └─────────────────────┘
```

| Component | Tech | Status |
|---|---|---|
| Web app | React 19, TypeScript, Vite, Zustand + immer, React Router 7, (TanStack Query in phase 2) | ✅ screens · ◐ API wiring |
| API | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 | ✅ |
| Database | PostgreSQL (SQLite for local and tests) | ✅ schema · ○ Azure instance |
| AI | `openai` SDK (AzureOpenAI), `anthropic` SDK (Anthropic / AnthropicFoundry) | ✅ code · ○ keys |
| AI jobs | FastAPI background tasks → `arq` + Redis | ○ |
| Source control | Azure DevOps REST 7.1 via OBO; GitHub REST | ◐ ADO (diffs stubbed) · ○ GitHub |
| Files | Azure Blob Storage with SAS | ◐ |
| Auth | Entra ID, MSAL (browser), PyJWT + JWKS (API) | ◐ |
| Hosting | Static Web Apps, Container Apps, Key Vault, App Insights | ○ |

---

## 2. Repository layout

```
Verity/
  PLAN.md  ARCHITECTURE.md  PREREQUISITES.md  DECISIONS.md  CLAUDE.md  README.md
  azure-pipelines.yml
  frontend/
    src/styles/verity.css      prototype CSS, verbatim (design source of truth)
    src/pages/                 one file per screen
    src/overlays/              modals, audit drawer, busy overlay, toasts, walkthrough
    src/components/            Shell (header + cycle header), shared UI bits
    src/store/                 UI state + actions (port of the prototype's S/A)
    src/api/                   typed API client (+ query hooks in phase 2)
    src/auth/                  MSAL
    src/data/demo.ts           demo-mode sample data only
    scripts/visual-diff.mjs    pixel parity check against the prototype
  backend/
    app/main.py                FastAPI app, CORS, routers
    app/core/                  config, db session, security (Entra, roles)
    app/models.py              tables
    app/routers/               HTTP layer only: validate input, check role, call services
    app/services/              workflow, scoring, reports, audit   (business rules live here)
    app/ai/                    prompts, reply schemas, providers/, service (run, check, retry, apply)
    app/integrations/          scm.py interface · azure_devops.py · github.py · demo.py
    app/storage/               Blob SAS
    app/jobs/                  ○ background AI jobs (phase 1.1)
    app/notifications/         ○ email / Teams (phase 6.2)
    alembic/                   migrations
    tests/                     unit + API flow tests (+ ai_eval/ in phase 5)
  docs/                        01_PRD … 14_DEBUGGING, reference/verity-prototype.html
```

**Layering rule:** routers → services → models/integrations. Routers never change `cycle.status` directly. Only `services/workflow.transition()` does that.

---

## 3. Domain model

```
User ─┐
      │ tester / approver / creator
App 1─* Cycle 1─* TestCase 1─* Evidence
 │        │  └──* AiRun (gen, regen, validate, bug)
 │        └──* AuditEvent
 └─* RegressionCase        AiRun (dups) ── App
```

| Entity | Notes |
|---|---|
| **App** | A linked repository: provider (`azure_devops` / `github`), org, project, repo, target branch. Settings: approval threshold, default tester, AI provider per step, AI inputs, ○ project template, ○ module list. |
| **Cycle** | One PR (or ○ release / ○ regression run). Snapshot of commits, files and work items at creation. AI summary and modules with risk. Status, tester, due date, approval. |
| **TestCase** | Key `TC-01` (unique per cycle), type, priority, module, source (diff / notes / reg / manual), steps, expected result. The **result lives on the same row** (status, actual, notes, bug, checked steps), since a case has exactly one result per cycle. |
| **Evidence** | File metadata. The file itself is in Blob Storage. |
| **AiRun** | Every AI call: prompt, reply, provider, model, tokens, attempts, errors, who. Immutable once finished. |
| **RegressionCase** | Per-app library: run history (last 10), tags, duplicate flag, archived. |
| **AuditEvent** | Append-only. Never updated or deleted. |

Readiness is **computed, not stored** (§5.4).

---

## 4. Workflow state machine

```
Draft ──gen──► Tests Generated ──assign──► Assigned ──first result──► In Testing ──submit──► Submitted
                    ▲  (curate, regen)                                     ▲                    │ validate
                    │                                                      │                    ▼
                    │                                         Changes Requested ◄──request── AI Reviewed ──approve──► Approved for UAT
```

| Transition | Who | Guard |
|---|---|---|
| Draft → Tests Generated | senior dev | successful `gen` AI run |
| Tests Generated → Assigned | senior dev, tester lead | ≥ 1 case, tester has tester role |
| Assigned / Changes Requested → In Testing | assigned tester | first result recorded |
| In Testing → Submitted | assigned tester | every case has a status |
| Submitted → AI Reviewed | system / senior dev | successful `validate` AI run |
| AI Reviewed → Approved for UAT | senior dev | score ≥ app threshold; findings explicitly accepted |
| AI Reviewed → Changes Requested | senior dev | comment |

Edit locks: cases are editable only in *Tests Generated*; results only in *Assigned / In Testing / Changes Requested* and only by the assigned tester. Defined in `backend/app/services/workflow.py`.

---

## 5. Key flows

### 5.1 Sign-in
Browser → MSAL redirect → Entra → back to `/signin` with tokens → every API call sends `Authorization: Bearer <token for api://verity-api>` → API validates signature, audience and issuer (JWKS), maps `groups` to a role, and creates the user on first login.

### 5.2 Create a cycle
1. `GET /apps/{id}/pull-requests`: API exchanges the user token for an Azure DevOps token (OBO) and lists active PRs into the target branch, with commits, AI notes and work items.
2. User ticks PRs/commits → `POST /apps/{id}/cycles` → API snapshots commits, changed files and work items into a **Draft** cycle and writes an audit event.
3. UI immediately starts AI `gen` (5.3).

### 5.3 AI run (async, phase 1.1)
```
UI ── POST /cycles/{id}/ai-runs {task, provider} ──► API: create ai_job (queued) ──► 202 {job_id}
UI ── GET /ai-jobs/{job_id} every 1s ──────────────► {status, step: 2, steps: [...]}  (drives the busy overlay)
Worker: build context → prompt → provider.complete_json() → check schema + ids → retry once → save AiRun → apply → commit
UI ◄─ {status: succeeded, result} ── refetch cycle ──► navigate / toast, exactly as in the prototype
```
Both providers use the same prompt and reply schema. Azure OpenAI uses `response_format: json_schema`; Claude uses one forced tool call whose `input_schema` is the reply schema. Failures surface as the prototype's "Not imported" errors.

### 5.4 Readiness score
Computed by `services/scoring.py` from case results + the latest successful `validate` run:
`100 − 8·fail − 6·blocked − 2·observations − 10·high-risk modules not verified − 2·N/A` (0–100). The same formula is in `frontend/src/lib/analyze.ts` for demo mode; in api mode the server value is shown.

### 5.5 Execution and evidence
Result changes autosave (`PUT …/result`). Evidence: UI asks `POST …/evidence` for a 15-minute SAS URL → uploads directly to Blob (the API never streams files) → metadata row saved. Create bug: AI draft (optional) → `POST …/bug` → Azure DevOps work item linked to the PR.

### 5.6 Approval
`POST /cycles/{id}/approve {note, accept_findings}` → checks threshold and acceptance → transition → audit → Azure DevOps PR status `verity/uat-ready = succeeded` → ○ notification to the client success team.

### 5.7 PR changes after testing started
Azure DevOps service hook → `POST /api/webhooks/azure-devops` (shared secret) → audit note and a banner on the cycle: "PR #482 changed after tests were generated" with Regenerate.

---

## 6. Frontend architecture

| Concern | Approach |
|---|---|
| Design | `verity.css` copied verbatim from the prototype; components output the prototype's HTML and class names; no UI library. |
| Modes | `VITE_MODE_DATA=demo`: in-browser sample data, role switcher, walkthrough (used for demos and the visual check). `api`: real backend and sign-in. |
| Server data (phase 2) | TanStack Query hooks per resource (`useApps`, `useCycle(id)`, `useReport(id)`…); mutations invalidate the cycle. |
| UI state | Zustand store: modal, drawer, toasts, busy overlay, filters, theme. |
| Routing | `/signin`, `/apps`, `/apps/:appId[/regression|/settings]`, `/apps/:appId/cycles/new`, `/cycles/:cycleId/review|run|report`, `/queue`. |
| Auth | MSAL redirect; token added by the API client. |
| Errors | API errors → existing toast and banner components. |

---

## 7. Security

- **Authentication:** Entra ID only. `AUTH_DEV_BYPASS` must be `false` outside local.
- **Authorisation:** role checks on every endpoint (`require(...)`), plus object rules (only the assigned tester records results).
- **Least privilege to Azure DevOps:** on-behalf-of the signed-in user, never a shared account (except the webhook, which only writes audit notes).
- **Secrets:** Key Vault, referenced by Container Apps. Never in git.
- **AI data handling:** only the cycle context is sent; secrets stripped from diffs (phase 5.6); per-app AI switch; every prompt and reply stored for review.
- **Files:** short-lived SAS URLs; malware scanning; size limits.
- **Audit:** append-only table, exported on request.

---

## 8. Deployment (Azure, phase 8)

| Resource | Use | Notes |
|---|---|---|
| Static Web Apps | Frontend | SPA fallback to `index.html` |
| Container Apps | API + AI worker (two apps, one image) | Managed identity to Key Vault, Blob, Postgres |
| PostgreSQL Flexible Server | Database | Daily backups, private networking |
| Storage account | Evidence blobs | Defender for Storage malware scanning |
| Azure Cache for Redis | AI job queue | Basic tier is enough |
| Key Vault | Secrets | Entra secret, AI keys |
| Application Insights | Logs, traces, alerts | API + frontend |
| Azure OpenAI | AI provider | Deployment name in config |
| Claude | AI provider | Anthropic API or Microsoft Foundry (`CLAUDE_HOSTING`) |

**Pipeline** (`azure-pipelines.yml`): PR → tests + build. `main` → build image → deploy to **dev** → run `alembic upgrade head` → smoke test → manual approval → **prod**.

---

## 9. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Unit | pytest | workflow, scoring, AI reply checks, prompt building |
| API | pytest + TestClient | full PR flow with the demo AI provider and demo source control |
| AI quality | pytest (`tests/ai_eval`) | real PRs against both providers before prompt changes |
| Visual | Playwright + pixelmatch | prototype vs app, 18 states, demo mode |
| End to end | Playwright | api mode, two roles, real database (phase 8.4) |

---

## 10. Configuration

All backend settings are in `backend/.env.example` (database, Entra, SCM mode, AI providers, storage). Frontend settings are in `frontend/.env.example` (`VITE_MODE_DATA`, Entra client id and scope). Production values live in Key Vault and Container Apps settings.
