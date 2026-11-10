# 14 · Debugging

| Symptom | Check |
|---|---|
| UI looks different from the prototype | Run the visual diff (13_TESTING). Look at `visual/out/*-diff.png`. Usually an inline style was missed or a class name differs. Never "fix" by editing verity.css alone. |
| Fonts look wider / different | `@fontsource` imports missing in `main.tsx`, or a browser extension overriding fonts. |
| 401 from API | Token audience must be the API app (`api://<id>`). In dev, set `AUTH_DEV_BYPASS=true` and send `X-Demo-User`. |
| 403 "You do not have a Verity role" | User is in none of the groups in `ENTRA_GROUP_ROLE_MAP`, or the token has no `groups` claim. |
| 409 "Cannot move a cycle from X to Y" | The action isn't allowed in that state (see `services/workflow.py`). |
| 503 "… is not configured" | Provider env vars missing (08_SETUP). |
| 502 provider call failed | Network, key, quota or model/deployment name. The run is stored with `status=failed` and the error in `ai_runs.errors`. |
| 422 "Not imported" after an AI run | The model's reply failed checks twice. Read `ai_runs.raw_reply` and `errors` for that run id. |
| Azure DevOps list is empty | On-behalf-of consent for Azure DevOps `user_impersonation` missing, or org not in `ADO_ORGANIZATIONS`. |
| Reset local data | `python -m app.seed --reset` |
