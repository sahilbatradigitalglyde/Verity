# 08 · Setup (Windows, Node 24 / npm 11, Python 3.13)

## Frontend
```powershell
cd frontend
copy .env.example .env      # VITE_MODE_DATA=demo runs without a backend
npm install
npm run dev                 # http://localhost:5173
```
`npm run build` type-checks and builds to `dist/`.

## Backend
```powershell
cd backend
py -3.13 -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env      # AUTH_DEV_BYPASS=true, AI_MODE=demo, SCM_MODE=demo work offline
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000     # http://localhost:8000/api/docs
pytest
```
Try it without a frontend: in `/api/docs`, add header `X-Demo-User: dev`.

## Turning on real services
| What | Set in backend/.env |
|---|---|
| Azure OpenAI | `AI_MODE=live`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` |
| Claude (Anthropic API) | `CLAUDE_HOSTING=anthropic`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` |
| Claude (Microsoft Foundry) | `CLAUDE_HOSTING=foundry`, `CLAUDE_FOUNDRY_RESOURCE`, `CLAUDE_FOUNDRY_API_KEY`, `CLAUDE_MODEL` |
| Azure DevOps | `SCM_MODE=azure_devops`, `ADO_ORGANIZATIONS`, Entra settings (10_AUTH) |
| Evidence | `EVIDENCE_STORAGE_CONNECTION_STRING`, `EVIDENCE_CONTAINER` |
| PostgreSQL | `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/verity` |
