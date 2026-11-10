# 13 · Testing

## Backend — `cd backend && pytest`
| Test | Proves |
|---|---|
| test_scoring | Prototype sample scores 82, "Ready for UAT with 2 observations", parts 80/86/89/86; P1 failure verdict |
| test_workflow | Full path incl. Changes Requested loop; invalid moves rejected |
| test_api_flow::test_full_cycle | PR #482 through the API: create → generate (14 cases) → edit/add/regenerate keeps edits → assign → locked → 14 results + evidence + bug → submit → validate (82, TC-09 consistency, TC-05 evidence gap) → approve needs confirmation → approved → audit trail |
| test_api_flow::test_changes_requested_loop | Request changes, tester resumes → In Testing |
| test_api_flow::test_regression_scan_and_merge | AI duplicate pairs, merge archives one |
| test_ai_validation | Wrong run_id → retry succeeds; bad ids → readable errors, run stored as failed |

## Visual parity — `cd frontend && npm run build && npx vite preview --port 4173` then
```
npx playwright install chromium    # once
npm run visual -- ../docs/reference/verity-prototype.html http://localhost:4173
```
Drives the prototype and the app through 18 identical states (sign in → … → approved, dark mode, Add App) and writes `visual/out/<screen>-{proto,app,diff}.png` plus a table. Expected: same heights, < 0.02% difference except the screens listed in 02_DESIGN as intentional.

Run it before every merge that touches the UI.
