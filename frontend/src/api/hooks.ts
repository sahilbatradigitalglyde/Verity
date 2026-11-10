/**
 * TanStack Query hooks for api mode (see PLAN.md task 2.2+).
 * Every hook is disabled when VITE_MODE_DATA=demo so queries never fire in demo mode.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { isDemo } from '@/config';

export const useApps = () =>
  useQuery({ queryKey: ['apps'], queryFn: () => api.apps(), enabled: !isDemo });

export const useApp = (id: string) =>
  useQuery({ queryKey: ['app', id], queryFn: () => api.app(id), enabled: !isDemo && !!id });

export const useCycle = (id: string) =>
  useQuery({ queryKey: ['cycle', id], queryFn: () => api.cycle(id), enabled: !isDemo && !!id });

export const useReport = (id: string) =>
  useQuery({ queryKey: ['report', id], queryFn: () => api.report(id), enabled: !isDemo && !!id });

export const useAdoOrgs = () =>
  useQuery({ queryKey: ['ado/orgs'], queryFn: () => api.adoOrgs(), enabled: !isDemo });

export const useAdoProjects = (org: string) =>
  useQuery({ queryKey: ['ado/projects', org], queryFn: () => api.adoProjects(org), enabled: !isDemo && !!org });

export const useAdoRepos = (org: string, project: string) =>
  useQuery({ queryKey: ['ado/repos', org, project], queryFn: () => api.adoRepos(org, project), enabled: !isDemo && !!org && !!project });

export const useLinkApp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { org: string; project: string; repo: string; name: string; branch: string }) => api.linkApp(b),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['apps'] }); },
  });
};

export const usePullRequests = (appId: string) =>
  useQuery({ queryKey: ['pull-requests', appId], queryFn: () => api.pullRequests(appId), enabled: !isDemo && !!appId });

export const useAppCycles = (appId: string, params: { q?: string; status?: string; tester?: string; page?: number }) =>
  useQuery({
    queryKey: ['app-cycles', appId, params],
    queryFn: () => api.cycles(appId, params),
    enabled: !isDemo && !!appId,
  });

export const useTesters = () =>
  useQuery({ queryKey: ['testers'], queryFn: () => api.testers(), enabled: !isDemo });

export const useUpdateAppSettings = (appId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Parameters<typeof api.updateAppSettings>[1]) => api.updateAppSettings(appId, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app', appId] });
      qc.invalidateQueries({ queryKey: ['apps'] });
    },
  });
};
