# Decision log

Short records of decisions that shape Verity. Add new ones at the bottom. Status: **Decided** or **Open**.

| ID | Decision | Status | Why / notes |
|---|---|---|---|
| D-001 | Frontend in **React + TypeScript (Vite)**, backend in **Python FastAPI** | Decided | Team skills; FastAPI fits AI work; React lets us reproduce the prototype exactly. |
| D-002 | The prototype (`docs/reference/verity-prototype.html`) is the **design source of truth**. CSS copied verbatim, no UI library, visual pixel check on every UI change. | Decided | Requirement: same design "inch by inch". |
| D-003 | **Both Azure OpenAI and Claude run inside Verity** (no download/paste hand-off). Same prompts and reply format; provider chosen per AI step by the admin. | Decided | Replies must flow straight back into the cycle. |
| D-004 | Claude hosting: **Anthropic API** or **Claude on Microsoft Foundry** | Open (manager) | Both supported by config (`CLAUDE_HOSTING`). Foundry keeps billing and data handling in the Azure tenant. |
| D-005 | Client approval to send code and test data to each AI provider | Open (manager) | Needed before enabling AI on client repos. Per-app AI on/off switch planned. |
| D-006 | Format for AI commit notes / dev check-in release notes | Open | Proposal: commit trailer `AI-Notes:` (or `Release-Notes:`) in the commit message; Verity reads text after it. Needs agreement with developers. |
| D-007 | Hosting: Azure Static Web Apps + Container Apps + PostgreSQL Flexible | Proposed | See ARCHITECTURE.md §8. |
| D-008 | Audit and evidence retention period | Open (client) | Proposal: audit 7 years, evidence 2 years. |
| D-009 | The **readiness score is computed by Verity, not the AI** | Decided | Same score whichever provider runs; AI only supplies findings. |
| D-010 | Five roles: Developer, Senior Developer, Tester, Tester Lead, Admin, mapped from Entra groups | Decided | Backend ready; Tester Lead and Developer screens in phase 7. |
| D-011 | Source control: Azure DevOps first, **GitHub two-way sync** next, behind one `SourceControl` interface | Decided | Teams commit to either depending on the project. |
