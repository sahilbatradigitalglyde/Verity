import type { ResultStatus, Status } from '@/types';

export const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');
export const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dayLabel = () => new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

/** Status pill class for each workflow status. */
export const WCLS: Record<Status, string> = {
  'Draft': 'p-nr', 'Tests Generated': 'p-ac', 'Assigned': 'p-ac', 'In Testing': 'p-ac', 'Submitted': 'p-ac',
  'AI Reviewed': 'p-acf', 'Approved for UAT': 'p-pass', 'Changes Requested': 'p-blk'
};

/** Result status: [label, pill class, colour, background]. */
export const RS: Record<Exclude<ResultStatus, ''>, [string, string, string, string]> = {
  pass: ['Pass', 'p-pass', 'var(--ps)', 'var(--psb)'],
  fail: ['Fail', 'p-fail', 'var(--fl)', 'var(--flb)'],
  blocked: ['Blocked', 'p-blk', 'var(--bk)', 'var(--bkb)'],
  na: ['Not Applicable', 'p-nr', 'var(--nr)', 'var(--nrb)']
};

export const scoreColor = (s: number) => (s >= 80 ? 'var(--ps)' : s >= 65 ? 'var(--bk)' : 'var(--fl)');

export function csv(v: unknown) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function download(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Statuses after which the tester can no longer change results. */
export const isLocked = (s: Status | undefined) => !!s && ['Submitted', 'AI Reviewed', 'Approved for UAT'].includes(s);

export const flowIndex = (FLOW: Status[], s: Status) => FLOW.indexOf(s);
