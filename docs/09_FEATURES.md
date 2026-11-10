# 09 · Features (behaviour spec, screen by screen)

Behaviour matches the prototype exactly. ✓ = working in the React app (demo mode) · API = endpoint ready.

| # | Screen | Feature | App | API |
|---|---|---|---|---|
| 1 | Sign in | Sign in with Microsoft, Entra explanation, theme toggle | ✓ | ✓ |
| 2 | Apps | Cards with repo path, open cycles, suite size, last approval, 30-day pass rate, status tag; filters | ✓ | ✓ |
| 2 | Apps | Add App modal: org → project → repo, "Already linked", name + target branch | ✓ | ✓ |
| 3 | App detail | Header, repo link, KPIs, tabs; cycles table with status pill, PR, author, tester, progress bar, AI readiness | ✓ | ✓ |
| 3 | Settings | Repo connection, default tester, approval threshold, AI inputs, provider per AI step, integration health | ✓ | ✓ |
| 4 | New cycle | Active PRs with work items; expand commits with AI notes and file counts; PR/commit checkboxes; scope summary; Generate | ✓ | ✓ |
| 5 | Review | AI change summary + risk counts + provenance; changes by module; files changed list | ✓ | ✓ |
| 5 | Review | Case table (ID, title, type, priority, file, source badge, preconditions, steps, expected); edit, duplicate, promote, delete with undo | ✓ | ✓ |
| 5 | Review | Add manually, Regenerate (keeps edits), Include related regression tests with match reasons, Assign to tester + due date | ✓ | ✓ |
| 6 | Queue | Open / Submitted / Completed tabs, change-request notes, progress, due | ✓ | ✓ |
| 6 | Execution | Progress bar per case, case list, steps checklist, actual result, Pass/Fail/Blocked/N/A, notes, defect link, Create bug (AI draft), evidence upload, Submit enabled when all have a status | ✓ | ✓ |
| 7 | Report | Score ring, verdict, counts, score parts, advisory note, coverage, result consistency, evidence gaps, failures and blocked with AI explanations, links to cases | ✓ | ✓ |
| 7 | Report | Approve (confirmation checkbox + note) · Request changes (prefilled comment) · Re-run validation | ✓ | ✓ |
| 8 | Regression | Search, module/result filters, sparkline, source cycle, AI duplicate scan + merge, bulk tag/archive/export | ✓ | ✓ |
| 9 | Audit trail | Drawer on any cycle, category filters, day groups, avatars, tags, CSV export | ✓ | ✓ |
| — | AI | Azure OpenAI and Claude both automatic, per-step default or ask each time | ✓ | ✓ |
