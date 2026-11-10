# 10 · Authentication and roles

## Microsoft Entra ID
Two app registrations:
1. **Verity API** — expose scope `access_as_user` (`api://<api-client-id>/access_as_user`). Add a client secret (for on-behalf-of). API permission: Azure DevOps → `user_impersonation` (delegated), admin consent. Set "groupMembershipClaims": "SecurityGroup" in the manifest so tokens carry `groups`.
2. **Verity Web (SPA)** — redirect URI `https://<host>/signin` (and `http://localhost:5173/signin`). API permission: Verity API → `access_as_user`.

Frontend `.env`: `VITE_MODE_DATA=api`, `VITE_ENTRA_CLIENT_ID` (SPA), `VITE_ENTRA_TENANT_ID`, `VITE_ENTRA_API_SCOPE`.
Backend `.env`: `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_API_CLIENT_SECRET`, `ENTRA_GROUP_ROLE_MAP`.

## Roles from groups
`ENTRA_GROUP_ROLE_MAP={"<group-id>":"senior_developer","<group-id>":"tester","<group-id>":"admin",...}`. If a user is in several groups the highest wins: admin > senior_developer > tester_lead > tester > developer.

## "Access mirrors Azure DevOps permissions"
The API never uses a service account to read repos. For each request it exchanges the user's token for an Azure DevOps token (on-behalf-of flow, `integrations/azure_devops.py`), so a user only sees orgs, projects and repos they can already open.

## Permission matrix
| Action | Developer | Senior Dev | Tester | Tester Lead | Admin |
|---|---|---|---|---|---|
| Link apps, settings | | | | | ✓ |
| Create cycle, generate/regenerate, curate cases | | ✓ | | | ✓ |
| Assign tester | | ✓ | | ✓ | ✓ |
| Record results, evidence, bugs, submit | | | ✓ (assigned) | ✓ | ✓ |
| Run validation, approve, request changes | | ✓ | | | ✓ |
| View cycles, reports, audit | ✓ | ✓ | ✓ | ✓ | ✓ |
