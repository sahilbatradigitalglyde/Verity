/** Shared domain types. These mirror the FastAPI response models in backend/app/schemas. */

export type Status =
  | 'Draft' | 'Tests Generated' | 'Assigned' | 'In Testing' | 'Submitted'
  | 'AI Reviewed' | 'Approved for UAT' | 'Changes Requested';

export type RoleKey = 'dev' | 'tester' | 'admin';
export type UserKey = RoleKey | 'ai' | 'sys';
export type Risk = 'High' | 'Medium' | 'Low';
export type CaseType = 'Functional' | 'Edge case' | 'Negative' | 'Regression';
export type Priority = 'P1' | 'P2' | 'P3';
export type Source = 'diff' | 'notes' | 'reg' | 'manual';
export type ResultStatus = '' | 'pass' | 'fail' | 'blocked' | 'na';
export type AiTask = 'gen' | 'regen' | 'validate' | 'bug' | 'dups';
export type AiProviderKey = 'azure' | 'claude';
export type AiMode = 'ask' | AiProviderKey;

export interface User { name: string; ini: string; role: string }
export interface Module { id: string; name: string; risk: Risk; desc: string }
export interface ChangedFile { status: 'A' | 'M'; path: string; added: number; removed: number }
export interface Commit { hash: string; message: string; author: string; aiNote: string; files: number }
export interface PullRequest {
  num: number; title: string; author: string; branch: string; created: string;
  items: string[]; inCycle: boolean; commits: Commit[];
}

export interface CaseResult {
  status: ResultStatus; actual: string; notes: string; bug: string; ev: string[]; chk: boolean[];
}
export interface TestCase {
  id: string; title: string; type: CaseType; pri: Priority; file: string; src: Source; mod: string;
  pre: string; steps: string[]; exp: string; edited: boolean; promoted: boolean; r: CaseResult;
}

export interface Provenance { prov: AiProviderKey; runId: string; by: UserKey; at: string; model?: string }

export interface AiFindings {
  consistency: { id: string; why: string }[];
  gaps: { id: string; why: string }[];
  explain: Record<string, string>;
  summary: string;
  p: Provenance;
}

export interface Cycle {
  status: Status;
  cases: TestCase[];
  mods: Module[];
  summary: string;
  suggest: string[];
  genAi: Provenance | null;
  tester: string; due: string; dueLabel: string;
  aiRuns: number;
  ai: AiFindings | null;
  changeComment: string; approvedNote: string; approvedAt: string;
}

export interface AppSummary {
  id: string; name: string; ini: string; path: string; open: number; reg: number; last: string;
  rate: number | null; tag: { label: string; cls: string } | null;
}

export interface RegressionCase {
  id: string; title: string; mod: string; pri: Priority; last: string; res: 'Pass' | 'Fail' | 'Blocked' | 'Not run';
  hist: string; src: string; dup: string; dupWhy: string; tags: string[];
}

export interface Suggestion {
  reg: string; title: string; reason: string; last: string; mod: string; pri: Priority;
  pre: string; steps: string[]; exp: string;
}

export interface AuditEvent {
  who: UserKey; what: string; detail: string; tag: string; tagCls: string;
  cat: 'Workflow' | 'Test cases' | 'Results' | 'AI runs' | 'Approvals'; time: string; day: string;
}

export interface StaticCycleRow {
  title: string; sub: string; status: Status; pr: string; author: string; tester: string;
  pass: number; fail: number; blocked: number; total: number; score: number | null; updated: string;
}

export interface AdoRepo { name: string; updated: string; branch: string }

export interface ApiPRCommit { hash: string; message: string; author: string; aiNote: string; files: number }
export interface ApiPR {
  num: number; title: string; author: string; branch: string; created: string;
  items: string[]; inCycle: boolean; draftId: string | null; commits: ApiPRCommit[];
}
export interface ApiJob {
  id: string; task: string; provider: string; status: string;
  step: number; steps: string[]; result: unknown; ai_run_id: string | null;
  error: unknown; created_at: string; finished_at: string | null;
}

/** Shape returned by GET /apps and POST /apps (api mode). */
export interface ApiApp {
  id: string; name: string; ini: string; path: string; org: string; project: string; repo: string;
  target_branch: string; approve_threshold: number; ai_modes: Record<string, string>;
  ai_inputs: Record<string, boolean>; modules: Module[];
  open: number; reg: number; last: string | null; rate: number | null; rate_30d: number | null;
  awaiting_review: number; approved_today: number; blocked: number; in_testing: number;
  default_tester_id: string | null;
}

export interface ApiCycleRow {
  id: string; app_id: string; name: string; kind: string;
  pr_number: number | null; pr_numbers: number[]; pr_title: string;
  source_branch: string; target_branch: string; authors: string[];
  status: string; tester: { id: string; name: string; initials: string; email: string; role: string } | null;
  commit_count: number; file_count: number; case_count: number;
  progress: { pass: number; fail: number; blocked: number; na: number };
  updated_at: string | null; score: number | null;
}

export interface ApiTester { id: string; name: string; initials: string; email: string; role: string }
