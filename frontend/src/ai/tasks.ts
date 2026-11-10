/**
 * AI step definitions shared by the UI. Both providers run automatically inside Verity:
 * the backend sends the prompt, checks the JSON reply against the schema and applies it.
 * The reply formats below mirror backend/app/ai/schemas.py.
 */
import type { AiMode, AiProviderKey, AiTask, Cycle, Priority, Risk, RegressionCase } from '@/types';
import { AIX, MODS, SUGG, TPL } from '@/data/demo';
import { modOf } from '@/lib/analyze';

export const AI_TASKS: Record<AiTask, { name: string; key: string; where: string; who: string }> = {
  gen: { name: 'Generate test cases', key: 'generate_test_cases', where: 'New test cycle → Generate Test Cases with AI', who: 'Senior Developer' },
  regen: { name: 'Regenerate test cases', key: 'regenerate_test_cases', where: 'Test case review → Regenerate', who: 'Senior Developer' },
  validate: { name: 'AI validation report', key: 'validate_results', where: 'After the tester submits → AI report', who: 'Senior Developer' },
  bug: { name: 'Draft bug report', key: 'draft_bug', where: 'Execution → Create bug', who: 'Tester' },
  dups: { name: 'Find duplicate regression cases', key: 'find_duplicates', where: 'Regression suite → Scan for duplicates', who: 'Senior Developer' }
};

export const MODE_LABEL: Record<AiMode, string> = { ask: 'Ask each time', azure: 'Azure OpenAI only', claude: 'Claude only' };
export const PROVIDER_LABEL: Record<AiProviderKey, string> = { azure: 'Azure OpenAI', claude: 'Claude' };

export const ENUM = {
  type: ['Functional', 'Edge case', 'Negative', 'Regression'],
  priority: ['P1', 'P2', 'P3'],
  risk: ['High', 'Medium', 'Low'],
  source: ['diff', 'notes', 'reg']
};

const STEPS: Record<AiTask, (p: string) => string[]> = {
  gen: p => ['Reading diffs from Azure DevOps', 'Reading AI commit notes and linked work items', `Sending to ${p}`, 'Checking the response format', 'Matching against the regression suite'],
  regen: p => ['Re-reading the diff', `Sending to ${p}`, 'Keeping your edited cases'],
  validate: p => ['Collecting results and evidence', `Sending to ${p}`, 'Checking the response format'],
  bug: p => ['Collecting the failed case and evidence', `Sending to ${p}`],
  dups: p => ['Loading the regression suite', `Sending to ${p}`, 'Checking the response format']
};
export const aiSteps = (task: AiTask, prov: AiProviderKey) => STEPS[task](PROVIDER_LABEL[prov]);

/* ---------- reply formats ---------- */
export interface GenReply {
  run_id: string; task: string; schema_version: string; change_summary: string;
  modules: { id: string; name: string; risk: Risk; description: string }[];
  test_cases: { title: string; type: string; priority: Priority; module: string; linked_file: string; source: string; preconditions: string; steps: string[]; expected_result: string }[];
  regression_suggestions: { regression_id: string; reason: string }[];
}
export interface ValidateReply {
  run_id: string; task: string; schema_version: string; summary: string;
  result_consistency: { case_id: string; reason: string }[];
  evidence_gaps: { case_id: string; reason: string }[];
  failures_and_blocked: { case_id: string; explanation: string }[];
}
export interface BugReply { run_id: string; task: string; schema_version: string; title: string; severity: string; area_path: string; repro_steps: string }
export interface DupsReply { run_id: string; task: string; schema_version: string; pairs: { a: string; b: string; reason: string }[] }

/* ---------- demo provider: deterministic replies identical to the prototype ---------- */
function heur(c: Cycle): Omit<ValidateReply, 'run_id' | 'task' | 'schema_version' | 'summary'> {
  const cs = c.cases;
  return {
    result_consistency: cs.filter(x => x.r.status === 'pass' && /moment|briefly|flicker|timeout|intermittent|but /i.test(x.r.actual))
      .map(x => ({ case_id: x.id, reason: 'The actual result describes behavior the expected result does not allow for, even if it settled later. A client user could see it. Confirm whether this is acceptable or should be a Fail.' })),
    evidence_gaps: cs.filter(x => x.r.status === 'pass' && x.pri === 'P1' && !x.r.ev.length)
      .map(x => ({ case_id: x.id, reason: `Marked Pass with no screenshot or log on a P1 case in ${modOf(c, x.mod).name.toLowerCase()} (${modOf(c, x.mod).risk.toLowerCase()} risk).` })),
    failures_and_blocked: cs.filter(x => x.r.status === 'fail' || x.r.status === 'blocked')
      .map(x => ({ case_id: x.id, explanation: AIX[x.id] || (x.r.status === 'fail' ? 'The actual result does not match the expected result in an area this PR changed. Check whether the defect is in the change or in the test data before approving.' : 'The case could not run, so this behavior is unverified. Run it in another environment or accept the risk explicitly.') }))
  };
}

export function demoReply(task: AiTask, runId: string, cycle: Cycle | null, runIdx: number, regression: RegressionCase[]) {
  const base = { run_id: runId, task: AI_TASKS[task].key, schema_version: '1.0' };
  if (task === 'gen' || task === 'regen') return {
    ...base,
    change_summary: 'Adjusters can now refund part of a settled claim instead of reversing the whole settlement. Refunds are stored in a new ledger, validated against the remaining balance, blocked on closed claims, and sent to Billing as an event. The settlement summary shows refunded and remaining amounts.',
    modules: MODS.map(m => ({ id: m.id, name: m.name, risk: m.risk, description: m.desc })),
    test_cases: TPL.map(t => ({ title: t.title, type: t.type, priority: t.pri, module: t.mod, linked_file: t.file, source: t.src, preconditions: t.pre, steps: t.steps, expected_result: t.exp })),
    regression_suggestions: SUGG.map(s => ({ regression_id: s.reg, reason: s.reason }))
  } as GenReply;
  if (task === 'validate') return {
    ...base, summary: 'High-risk refund logic and validation were tested. Review the observations and the failed and blocked cases before approving.', ...heur(cycle!)
  } as ValidateReply;
  if (task === 'bug') {
    const t = cycle!.cases[runIdx];
    return {
      ...base, title: `${t.id} failed: ${t.title}`.slice(0, 90), severity: t.pri === 'P1' ? '2 - High' : '3 - Medium', area_path: 'Claims\\Settlement',
      repro_steps: 'Preconditions: ' + t.pre + '\n' + t.steps.map((s, i) => (i + 1) + '. ' + s).join('\n') + '\nExpected: ' + t.exp + '\nActual: ' + (t.r.actual || 'See attached evidence.')
    } as BugReply;
  }
  return {
    ...base,
    pairs: [
      { a: 'REG-118', b: 'REG-131', reason: 'Both settle a claim for the full amount end to end and check the same outcome.' },
      { a: 'REG-201', b: 'REG-209', reason: 'Both check that an adjuster cannot edit a closed claim.' }
    ].filter(p => regression.some(r => r.id === p.a) && regression.some(r => r.id === p.b))
  } as DupsReply;
}
