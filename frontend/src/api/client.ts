/**
 * Typed client for the FastAPI backend (API mode). Endpoints match backend/app/routers.
 * The store actions call these when VITE_MODE_DATA=api; see docs/07_PLAN.md (Phase 2) for wiring order.
 */
import { config } from '@/config';
import { getApiToken } from '@/auth/msal';
import type { AdoRepo, ApiApp, ApiCycleRow, ApiJob, ApiPR, ApiTester, AiProviderKey, AiTask } from '@/types';

// Role for X-Demo-User header when no Entra client id is configured (dev bypass until phase 3).
let _devUser = 'dev';
export const setDevUser = (role: string) => { _devUser = role; };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.entra.clientId) {
    const token = await getApiToken();
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    headers['X-Demo-User'] = _devUser;
  }
  const r = await fetch(config.apiBase + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!r.ok) {
    const detail = await r.json().catch(() => ({}));
    throw new Error(detail.detail || `${method} ${path} failed with ${r.status}`);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

export const api = {
  me: () => req('GET', '/me'),
  apps: () => req<ApiApp[]>('GET', '/apps'),
  app: (id: string) => req<ApiApp>('GET', `/apps/${id}`),
  linkApp: (b: { org: string; project: string; repo: string; name: string; branch: string }) => req<ApiApp>('POST', '/apps', b),
  adoOrgs: () => req<string[]>('GET', '/ado/orgs'),
  adoProjects: (org: string) => req<string[]>('GET', `/ado/orgs/${org}/projects`),
  adoRepos: (org: string, project: string) => req<AdoRepo[]>('GET', `/ado/orgs/${org}/projects/${project}/repos`),
  pullRequests: (appId: string) => req<ApiPR[]>('GET', `/apps/${appId}/pull-requests`),
  aiJob: (jobId: string) => req<ApiJob>('GET', `/ai-jobs/${jobId}`),
  testers: () => req<ApiTester[]>('GET', '/users/testers'),
  updateAppSettings: (appId: string, b: { target_branch?: string; default_tester_id?: string | null; approve_threshold?: number; ai_modes?: Record<string, string>; ai_inputs?: Record<string, boolean> }) => req<ApiApp>('PATCH', `/apps/${appId}/settings`, b),

  cycles: (appId: string, p?: { q?: string; status?: string; tester?: string; page?: number }) => {
    const params = new URLSearchParams();
    if (p?.q) params.set('q', p.q);
    if (p?.status) params.set('status', p.status);
    if (p?.tester) params.set('tester', p.tester);
    if (p?.page && p.page > 1) params.set('page', String(p.page));
    const qs = params.toString();
    return req<{ items: ApiCycleRow[]; total: number; page: number; pages: number }>('GET', `/apps/${appId}/cycles${qs ? '?' + qs : ''}`);
  },
  cycle: (id: string) => req('GET', `/cycles/${id}`),
  createCycle: (appId: string, b: { name: string; pr_numbers: number[]; commit_shas: string[] }) => req('POST', `/apps/${appId}/cycles`, b),
  deleteDraftCycle: (appId: string, cycleId: string) => req<void>('DELETE', `/apps/${appId}/cycles/${cycleId}`),
  runAi: (cycleId: string, task: AiTask, provider: AiProviderKey) => req('POST', `/cycles/${cycleId}/ai-runs`, { task, provider }),

  addCase: (cycleId: string, b: unknown) => req('POST', `/cycles/${cycleId}/cases`, b),
  updateCase: (cycleId: string, caseId: string, b: unknown) => req('PATCH', `/cycles/${cycleId}/cases/${caseId}`, b),
  deleteCase: (cycleId: string, caseId: string) => req('DELETE', `/cycles/${cycleId}/cases/${caseId}`),
  promoteCase: (cycleId: string, caseId: string) => req('POST', `/cycles/${cycleId}/cases/${caseId}/promote`),
  assign: (cycleId: string, b: { tester_id: string; due: string }) => req('POST', `/cycles/${cycleId}/assign`, b),

  recordResult: (cycleId: string, caseId: string, b: unknown) => req('PUT', `/cycles/${cycleId}/cases/${caseId}/result`, b),
  evidenceUploadUrl: (cycleId: string, caseId: string, fileName: string) => req<{ upload_url: string; blob_name: string }>('POST', `/cycles/${cycleId}/cases/${caseId}/evidence`, { file_name: fileName }),
  createBug: (cycleId: string, caseId: string, b: unknown) => req('POST', `/cycles/${cycleId}/cases/${caseId}/bug`, b),
  submit: (cycleId: string) => req('POST', `/cycles/${cycleId}/submit`),

  report: (cycleId: string) => req('GET', `/cycles/${cycleId}/report`),
  approve: (cycleId: string, note: string) => req('POST', `/cycles/${cycleId}/approve`, { note, accept_findings: true }),
  requestChanges: (cycleId: string, comment: string) => req('POST', `/cycles/${cycleId}/request-changes`, { comment }),
  audit: (cycleId: string) => req('GET', `/cycles/${cycleId}/audit`),

  regression: (appId: string) => req('GET', `/apps/${appId}/regression`),
  scanDuplicates: (appId: string, provider: AiProviderKey) => req('POST', `/apps/${appId}/regression/scan-duplicates`, { provider }),
  mergeRegression: (appId: string, keep: string, drop: string) => req('POST', `/apps/${appId}/regression/merge`, { keep, drop })
};
