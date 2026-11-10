# 01 · Product requirements — Verity

## What it is
Verity is an AI-assisted test validation platform connected to Azure DevOps (GitHub next). It takes a pull request from code to client UAT: AI drafts test cases from the diff, a senior developer curates and assigns them, a tester executes and records evidence, AI checks the results, and the senior developer approves for client UAT.

The source of truth for look and behaviour is `docs/reference/verity-prototype.html`. The web app must match it pixel for pixel and click for click (see 02_DESIGN and 13_TESTING).

## Roles
| Role | Can do |
|---|---|
| Senior Developer | Pull PRs, generate and curate test cases, assign testers, run AI validation, approve for UAT or request changes |
| Tester | Execute assigned cases, record results, attach evidence, create bugs, submit for review |
| Admin | Link apps / repositories, app settings, AI provider per step |
| Tester Lead *(backend ready, UI phase 3)* | Assign testers, see every tester's queue |
| Developer *(backend ready, UI phase 3)* | Read-only view of cycles for their own PRs |

## Workflow
Draft → Tests Generated → Assigned → In Testing → Submitted → AI Reviewed → Approved for UAT. "Changes Requested" returns the cycle to In Testing.

## Screens
1. Sign in (Microsoft Entra ID) · 2. Apps dashboard + Add App · 3. App detail (Test Cycles, Regression Suite, Settings) · 4. New test cycle from PRs/commits · 5. AI analysis and test case review · 6. Tester workspace (queue + execution) · 7. AI validation report · 8. Regression suite library · 9. Audit trail drawer.

## AI
Every AI step (generate, regenerate, validate, draft bug, find duplicates) runs **inside Verity** with either **Azure OpenAI** or **Claude**, chosen per step by the admin (or "Ask each time"). The reply comes straight back into the cycle. The readiness score is calculated by Verity, never by the AI, so both providers score the same. The AI review is advisory; approval is a human decision recorded under the approver's name.

## Out of scope for v1
Automated test execution, client-side UAT portal, mobile layouts below 760px beyond what the prototype already supports.

## Open decisions (owner: Saahil's manager)
- Claude hosting: Anthropic API directly or Claude on Microsoft Foundry (both supported by config).
- Client approval for sending diffs and test data to each AI provider.
