# 12 · Integrations

## Azure DevOps (`backend/app/integrations/azure_devops.py`)
| Need | REST call (api-version 7.1) |
|---|---|
| Projects / repos | `_apis/projects`, `{project}/_apis/git/repositories` |
| Active PRs into target branch | `…/pullrequests?searchCriteria.status=active&searchCriteria.targetRefName=refs/heads/main` |
| PR commits / work items | `…/pullRequests/{id}/commits`, `…/workitems` |
| Changed files | `…/pullRequests/{id}/iterations/{n}/changes` (+ diffs API for line counts and patches) |
| Acceptance criteria | `_apis/wit/workitems?ids=…&fields=System.Title,Microsoft.VSTS.Common.AcceptanceCriteria` |
| Create bug | `_apis/wit/workitems/$Bug` (JSON patch) |
| PR status check | `…/pullRequests/{id}/statuses` with context `verity/uat-ready` |
| Service hook | "Pull request updated" → `POST /api/webhooks/azure-devops` |

AI commit notes / dev check-in release notes are read from commit message trailers `AI-Notes:` or `Release-Notes:`.

## GitHub (phase 3, `integrations/github.py`)
Same `SourceControl` interface: PRs, commits, files (with patches), issues as bugs, commit status `verity/uat-ready`. Two-way sync via `pull_request` and `push` webhooks.

## AI providers
Azure OpenAI (`openai` SDK, `AzureOpenAI`) and Claude (`anthropic` SDK, `Anthropic` or `AnthropicFoundry`). See 06_AGENTS.

## Evidence storage
Azure Blob Storage; browser uploads straight to Blob with a 15-minute SAS URL from `POST /cycles/{id}/cases/{key}/evidence`.

## Notifications (phase 3)
Email + Teams on assign, submit, changes requested, approved.
