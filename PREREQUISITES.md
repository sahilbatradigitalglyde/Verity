# What to request before going live

Send this to your Azure / IT admin on day 1. Phases 3–5 and 8 in `PLAN.md` depend on it. Until it arrives, development continues with dev sign-in (`AUTH_DEV_BYPASS`), demo AI (`AI_MODE=demo`) and sample repos (`SCM_MODE=demo`).

## 1. Microsoft Entra ID (sign-in and roles)
- [ ] **App registration "Verity API"**
  - Expose an API: Application ID URI `api://<client-id>`, scope `access_as_user`.
  - Client secret (for the on-behalf-of flow to Azure DevOps) → store in Key Vault.
  - API permission: **Azure DevOps › user_impersonation** (delegated), with admin consent.
  - Token configuration: add the **groups** claim (security groups).
- [ ] **App registration "Verity Web"** (single-page app)
  - Redirect URIs: `http://localhost:5173/signin`, `https://<dev-host>/signin`, `https://<prod-host>/signin`.
  - API permission: Verity API › `access_as_user`.
- [ ] **Security groups** and their object IDs: `Verity-Admins`, `Verity-SeniorDevelopers`, `Verity-TesterLeads`, `Verity-Testers`, `Verity-Developers`.
- [ ] Send back: tenant ID, both client IDs, the API secret (via Key Vault), the group object IDs.

## 2. Azure DevOps
- [ ] Organization name(s) Verity should list (for `ADO_ORGANIZATIONS`).
- [ ] Confirm users have at least **Reader** on the repos and **Contributor** on the work item area paths where bugs are filed.
- [ ] Permission to create **service hooks** (Project settings › Service hooks) for "Pull request updated" → `https://<api-host>/api/webhooks/azure-devops`.
- [ ] Permission for Verity to post **PR statuses** (`verity/uat-ready`), and optionally a branch policy that requires it.
- [ ] A project for the `verity` repo and its pipeline.

## 3. AI providers
- [ ] **Azure OpenAI:** resource endpoint, API key (Key Vault), deployment name (e.g. `verity-gpt-4.1`), and quota (tokens per minute).
- [ ] **Claude:** decide the hosting (see `DECISIONS.md` D-004):
  - Anthropic API: organization API key, approved model id, or
  - Microsoft Foundry: Foundry resource name, key, approved model id.
- [ ] Written confirmation of which clients allow their code and test data to be sent to each provider.

## 4. Azure resources (for dev and prod)
- [ ] Resource group per environment (`rg-verity-dev`, `rg-verity-prod`).
- [ ] PostgreSQL Flexible Server (dev can be the smallest burstable tier).
- [ ] Storage account + container `evidence`, Defender for Storage malware scanning.
- [ ] Container Apps environment (API + worker), Static Web App (frontend).
- [ ] Key Vault, Application Insights, Azure Cache for Redis (Basic).
- [ ] Service connection from Azure DevOps Pipelines to the subscription.

## 5. Notifications (phase 6)
- [ ] Microsoft Graph `Mail.Send` (application) for a sender mailbox such as `verity@digitalglyde.com`, or an SMTP relay.
- [ ] Teams: an incoming webhook per channel, or approval to register a bot.

## 6. Decisions from your manager
See `DECISIONS.md`, open items D-004 to D-008.
