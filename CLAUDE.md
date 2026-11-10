# Instructions for Claude Code in this repo

Verity is an AI-assisted test validation platform (React + FastAPI). Read `PLAN.md` for what to build next and `ARCHITECTURE.md` for how it fits together.

## Non-negotiable: the design must match the prototype exactly
- `docs/reference/verity-prototype.html` is the design and behaviour spec.
- `frontend/src/styles/verity.css` is the prototype CSS copied verbatim. **Do not edit it** unless the change is also made in the prototype and the user asked for it.
- Components must output the same HTML structure, class names and inline styles as the prototype's view functions (`vApps`, `vReview`, `vRun`, `vReport`, …). Do not add UI libraries (MUI, Fluent, Tailwind, shadcn).
- New screens use only existing classes and tokens (`--acf`, `--ps`, `--fl`, `--bk`, `--nr`, `.card`, `.btn`, `.pill`, …).
- Keep demo mode (`VITE_MODE_DATA=demo`) working; the visual check depends on it.

## Before saying a task is done
```powershell
cd backend;  pytest
cd ..\frontend;  npm run build
# UI changes: npm run build; npx vite preview --port 4173 (separate terminal), then
npm run visual -- ..\docs\reference\verity-prototype.html http://localhost:4173
```
The visual table must show the same heights and < 0.02% difference, except the intentional screens listed in `docs/02_DESIGN.md`.

## Backend rules
- Layers: routers (HTTP, input, role check) → services (rules) → models / integrations.
- Change a cycle's status **only** through `app/services/workflow.transition()`.
- Every data change writes an audit event (`app/services/audit.log`).
- Every endpoint has a role check (`require(...)`), and object checks where needed (only the assigned tester edits results).
- AI goes through `app/ai/service.run_task()`. Never call a provider directly from a router. Both providers must keep the same prompts and reply schemas (`app/ai/schemas.py`).
- The readiness score is computed in `app/services/scoring.py`; the AI never outputs a score. Keep `frontend/src/lib/analyze.ts` in sync with it.
- Schema changes need an Alembic migration: `alembic revision --autogenerate -m "..."`.
- Windows-friendly code: no `%-d` in strftime, use `pathlib`.

## File and migration hygiene
- Keep files UTF-8 without BOM and never replace typographic quotes (’ “ ”) in UI text.
- Never edit a migration that has already been applied; always add a new one.

## Frontend rules
- TypeScript strict; no `any` unless unavoidable.
- Server data through `src/api/client.ts` (and TanStack Query from phase 2); UI-only state in the Zustand store.
- Keep store action names stable; screens call actions, actions call the API.

## Working style
- One screen or feature per branch and PR, matching the task numbers in `PLAN.md`. Tick the box when done.
- Update `docs/05_API.md` when endpoints change, and `DECISIONS.md` for any new decision.
- Ask before changing the workflow states, the score formula or anything visible that the prototype does not show.
