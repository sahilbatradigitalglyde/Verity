# Verity

AI-assisted test validation for Azure DevOps pull requests: PR → AI test cases → tester execution with evidence → AI validation → approval for client UAT.

- `frontend/` — React + TypeScript (Vite). Pixel-identical port of `docs/reference/verity-prototype.html`.
- `backend/` — Python FastAPI, SQLAlchemy, Alembic. Azure OpenAI and Claude both run inside Verity.
- `docs/` — 01_PRD … 14_DEBUGGING.

**Start here**
| File | What it is |
|---|---|
| `PLAN.md` | Master plan: phases, tasks, Claude Code prompts, definition of done |
| `ARCHITECTURE.md` | How the system is built: components, data model, flows, security, deployment |
| `PREREQUISITES.md` | Access and Azure resources to request from your admin |
| `DECISIONS.md` | Decision log, including open items for your manager |
| `CLAUDE.md` | Rules Claude Code follows in this repo |
| `azure-pipelines.yml` | CI: backend tests + frontend build |

Quick start (no keys needed): see `docs/08_SETUP.md`.
```
cd frontend && npm install && npm run dev           # demo mode, http://localhost:5173
cd backend  && pip install -r requirements-dev.txt && alembic upgrade head && python -m app.seed && uvicorn app.main:app --reload
```
