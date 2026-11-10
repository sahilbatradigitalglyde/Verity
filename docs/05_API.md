# 05 · API

Base path `/api`. Interactive docs at `/api/docs` when the backend runs. Auth: `Authorization: Bearer <Entra token>`; in development with `AUTH_DEV_BYPASS=true`, `X-Demo-User: dev | tester | admin | developer | tester_lead`.

| Method | Path | Who | Does |
|---|---|---|---|
| GET | /me · /me/queue · /users/testers | any | Current user · tester's queue · people picker |
| GET | /apps | any | Dashboard cards (open cycles, suite size, last approval, all-time pass rate, 30-day pass rate). Each app includes `modules` (per-app module vocabulary). |
| POST | /apps | admin | Link a repository |
| PATCH | /apps/{id}/settings | admin | Target branch, default tester, approval threshold, AI provider per step, AI inputs, `modules` (per-app module list `[{id,name,risk,desc}]`). AI gen populates `modules` automatically on first run. |
| GET | /ado/orgs · /ado/orgs/{org}/projects · …/repos | admin | Add App picker (as the user) |
| GET | /apps/{id}/pull-requests | any | Active PRs with commits and AI notes |
| GET/POST | /apps/{id}/cycles | any / senior dev | List cycles (paginated: `?status=&tester=&q=&page=&page_size=`) · create Draft cycle (`pr_numbers` array supports release cycles with multiple PRs; files are merged across PRs). Response includes `pr_numbers` and `kind` (`pr`\|`release`). List returns `{items, total, page, pages}`. |
| GET | /cycles/{id} | any | Full cycle with cases and results |
| POST | /cycles/{id}/ai-runs | senior dev (gen, regen, validate) · tester (bug) | `{task, provider: azure|claude}` — runs in Verity, validates, applies |
| POST/PATCH/DELETE | /cycles/{id}/cases[/{key}] | senior dev | Add manual, edit, delete (Tests Generated only) |
| POST | /cycles/{id}/cases/{key}/duplicate · /promote | senior dev | Duplicate · promote to regression |
| POST | /cycles/{id}/suggestions/{REG-id} | senior dev | Include a suggested regression case |
| POST | /cycles/{id}/assign | senior dev, tester lead | `{tester_id, due}` |
| PUT | /cycles/{id}/cases/{key}/result | assigned tester | `{status, actual, notes, bug, chk}`; first result moves to In Testing |
| POST/DELETE | /cycles/{id}/cases/{key}/evidence | assigned tester | Returns a SAS upload URL |
| POST | /cycles/{id}/cases/{key}/bug | assigned tester | Creates the bug in Azure DevOps |
| POST | /cycles/{id}/submit | assigned tester | All cases need a status |
| GET | /cycles/{id}/report | any | Readiness score, verdict, coverage, consistency, evidence gaps, failures |
| POST | /cycles/{id}/approve | senior dev | `{note, accept_findings}`; enforces the app's threshold; sets PR status `verity/uat-ready` |
| POST | /cycles/{id}/request-changes | senior dev | `{comment}` |
| GET | /cycles/{id}/audit | any | Audit trail |
| GET | /apps/{id}/regression (+ /tag, /archive, /export.csv, /scan-duplicates, /merge) | — | Regression library. `GET` is paginated (`?q=&module=&result=&page=&page_size=`), returns `{items, total, page, pages}`. `/export.csv` is not paginated. |
| POST | /cycles/{id}/cases/{key}/restore | senior dev | Undoes a soft delete; restores `deleted_at=null` and bumps `version` |
| POST | /webhooks/azure-devops | service hook | PR updated → audit note on open cycles |

Errors: `403` wrong role, `409` invalid state change, `422` validation (AI reply errors come back as `{message, errors[], run_id}`), `502` provider call failed, `503` provider not configured.
