# 03 · Architecture

> The detailed, up-to-date version is **`/ARCHITECTURE.md`** in the repo root. This page is the short summary kept for the standard docs structure.

```
Browser (React + Vite + TS)
   │  MSAL (Entra ID) → bearer token
   ▼
FastAPI (Python 3.13)  ── SQLAlchemy ──► PostgreSQL (SQLite locally)
   │        │                    └─────► Azure Blob Storage (evidence, via SAS URLs)
   │        ├── AI service ──► Azure OpenAI   (structured outputs)
   │        │              └─► Claude          (Anthropic API or Microsoft Foundry, forced tool call)
   │        └── Source control ─► Azure DevOps REST (on-behalf-of the user)  ·  GitHub (phase 3)
   ◄── Azure DevOps service hooks (PR updated) → /api/webhooks/azure-devops
```

## Repository layout
```
verity/
  frontend/   React app (pixel-identical port of the prototype)
    src/styles/verity.css   prototype CSS, verbatim
    src/pages/*             one file per screen
    src/overlays/*          modals, audit drawer, busy overlay, toasts, walkthrough
    src/store/index.ts      state + actions (port of the prototype's S and A objects)
    src/lib/analyze.ts      readiness score (same formula as backend)
    src/api/client.ts       typed API client (API mode)
    scripts/visual-diff.mjs pixel parity check vs the prototype
  backend/    FastAPI
    app/models.py           tables
    app/services/workflow.py  state machine
    app/services/scoring.py   readiness score
    app/ai/                 prompts, reply schemas, providers, run/validate/apply
    app/integrations/       Azure DevOps, GitHub, demo
    app/routers/            REST endpoints
    alembic/                migrations
  docs/       01–14 + reference/verity-prototype.html
```

## Key decisions
- **Score on the server.** Verity computes readiness from results + AI findings; the AI never outputs a score.
- **One AI interface.** `AIProvider.complete_json()`; Azure OpenAI and Claude are interchangeable per step.
- **Validate every AI reply** against Pydantic models + semantic checks; retry once with the errors; store every run.
- **State machine** in one place (`workflow.py`); routers cannot set `status` directly.
- **Append-only audit** for every change.
- **Two modes.** `demo` (no network, prototype data) for demos and visual tests; `api` for real use.
