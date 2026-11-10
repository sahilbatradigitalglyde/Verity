/**
 * Application state and actions. A 1:1 port of the prototype's `S` object and its action handlers,
 * so behaviour matches click for click. In demo mode everything runs in the browser; in API mode
 * the same actions are backed by the FastAPI endpoints (see src/api/client.ts and docs/07_PLAN.md).
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  AiMode, AiProviderKey, AiTask, AppSummary, AuditEvent, Cycle, Provenance, RegressionCase, RoleKey,
  TestCase, UserKey, CaseResult, Status
} from '@/types';
import { INITIAL_APPS, INITIAL_REGRESSION, MODREG, MODS, PRS, SAMPLE, SUGG, USERS, ADO } from '@/data/demo';
import { now, dayLabel, plural, RS, download, csv } from '@/lib/util';
import { analyze } from '@/lib/analyze';
import { setDevUser } from '@/api/client';
import { isDemo } from '@/config';
import { AI_TASKS, ENUM, aiSteps, demoReply, type BugReply, type DupsReply, type GenReply, type ValidateReply, PROVIDER_LABEL } from '@/ai/tasks';

/* ---------- navigation bridge (set by <App/>) ---------- */
let navigateFn: (to: string) => void = to => { window.location.assign(to); };
export const setNavigate = (fn: (to: string) => void) => { navigateFn = fn; };
export const go = (to: string) => navigateFn(to.startsWith('/') ? to : '/' + to);
const currentPath = () => window.location.pathname;

/* ---------- dev session persistence (api mode only) ---------- */
const SESSION_KEY = 'verity-dev-session';
const saveDevSession = (role: RoleKey) => {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role })); } catch {}
};
const clearDevSession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch {} };
const readDevSession = (): { role: RoleKey } | null => {
  if (isDemo) return null;
  try { const v = sessionStorage.getItem(SESSION_KEY); return v ? (JSON.parse(v) as { role: RoleKey }) : null; } catch { return null; }
};
const _devSession = readDevSession();
if (_devSession?.role) setDevUser(_devSession.role);

export type ModalState =
  | { type: 'aichoose'; task: AiTask; onPick?: (prov: AiProviderKey) => void }
  | { type: 'addapp'; org: string; proj: string; repo: string | null; name: string; branch: string }
  | { type: 'case'; id: string | null }
  | { type: 'bug'; draft: BugReply | null; p?: Provenance }
  | { type: 'approve'; ok: boolean }
  | { type: 'changes' }
  | { type: 'tag' }
  | { type: 'merge'; id: string };

export interface Toast { id: number; msg: string; actLabel?: string; actKey?: 'report' | 'undo' }

export interface State {
  signedIn: boolean; role: RoleKey; theme: 'light' | 'dark'; guideOpen: boolean; sawAudit: boolean; addedApp: boolean;
  apps: AppSummary[]; appFilter: 'All' | 'Open' | 'Attention';
  sel: Record<string, boolean>; openPR: Record<number, boolean>;
  cycle: Cycle | null; runIdx: number;
  suggestionsOn: boolean; suggAdded: Record<string, string>;
  regression: RegressionCase[]; regSel: Record<string, boolean>; regQ: string; regMod: string; regRes: string; regTotal: number; regNext: number;
  audit: AuditEvent[]; auditFilter: string;
  aiMode: Record<AiTask, AiMode>; runSeq: number; dupRun: Provenance | null;
  modal: ModalState | null; drawer: boolean; busy: { msg: string; steps?: string[]; i: number } | null;
  queueTab: 'Open' | 'Submitted' | 'Completed'; bugSeq: number; lastDel: { t: TestCase; i: number } | null;
  toasts: Toast[];
}

const initialTheme = (): 'light' | 'dark' => {
  try {
    const t = localStorage.getItem('verity-theme');
    if (t === 'light' || t === 'dark') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
};

const initialState = (resetSession = false): State => ({
  signedIn: !resetSession && !isDemo && !!_devSession?.role,
  role: (!resetSession && _devSession?.role) ? _devSession.role : 'dev',
  theme: initialTheme(), guideOpen: false, sawAudit: false, addedApp: false,
  apps: structuredClone(INITIAL_APPS), appFilter: 'All',
  sel: Object.fromEntries(PRS[0].commits.map(c => [c.hash, true])), openPR: { 482: true },
  cycle: null, runIdx: 0, suggestionsOn: false, suggAdded: {},
  regression: structuredClone(INITIAL_REGRESSION), regSel: {}, regQ: '', regMod: 'All', regRes: 'All', regTotal: 214, regNext: 215,
  audit: [], auditFilter: 'All',
  aiMode: { gen: 'ask', regen: 'ask', validate: 'ask', bug: 'ask', dups: 'ask' }, runSeq: 1, dupRun: null,
  modal: null, drawer: false, busy: null, queueTab: 'Open', bugSeq: 1318, lastDel: null, toasts: []
});

export const newResult = (): CaseResult => ({ status: '', actual: '', notes: '', bug: '', ev: [], chk: [] });
export const home = (role: RoleKey) => (role === 'tester' ? '/queue' : '/apps');

interface Actions {
  toast(msg: string, actLabel?: string, actKey?: Toast['actKey']): void;
  dismissToast(id: number): void;
  toastAct(key: Toast['actKey']): void;
  log(who: UserKey, what: string, detail?: string, tag?: string, tagCls?: string, cat?: AuditEvent['cat']): void;
  set(fn: (s: State) => void): void;
  signIn(role: RoleKey): void;
  signOut(): void;
  toggleTheme(): void;
  setRole(r: RoleKey, path?: string): void;
  // apps
  linkApp(): void;
  // new cycle
  togglePr(num: number): void;
  toggleCommit(hash: string, on: boolean): void;
  // AI
  aiStart(task: AiTask): void;
  aiRun(task: AiTask, prov: AiProviderKey): void;
  // review
  saveCase(data: Pick<TestCase, 'title' | 'type' | 'pri' | 'mod' | 'file' | 'pre' | 'steps' | 'exp'>): void;
  dupCase(id: string): void;
  delCase(id: string): void;
  promoteCase(id: string): void;
  addSugg(reg: string): void;
  addAllSugg(): void;
  assign(tester: string, due: string): void;
  // run
  setStatus(s: 'pass' | 'fail' | 'blocked' | 'na'): void;
  fillSample(): void;
  saveBug(title: string): void;
  submit(): void;
  // report
  approve(note: string): void;
  requestChanges(comment: string): void;
  openCase(id: string): void;
  openAudit(): void;
  // regression
  tagSelected(tag: string): void;
  archiveSelected(): void;
  exportRegression(rows: RegressionCase[]): void;
  mergeDup(keep: string, drop: string): void;
  exportAudit(): void;
  reset(): void;
}

let toastSeq = 1;

export const useStore = create<State & Actions>()(immer((set, get) => {
  const S = () => get();
  const setStatus = (st: Status) => set(s => { if (s.cycle) s.cycle.status = st; });
  const ensureInTesting = () => {
    const c = S().cycle!;
    if (c.status === 'Assigned') { setStatus('In Testing'); S().log('tester', 'Started testing', '', 'Assigned → In Testing', 'p-ac', 'Workflow'); }
    else if (c.status === 'Changes Requested') { setStatus('In Testing'); S().log('tester', 'Resumed testing after changes were requested', '', 'Changes Requested → In Testing', 'p-ac', 'Workflow'); }
  };
  const nextCaseId = () => {
    const n = Math.max(0, ...S().cycle!.cases.map(c => parseInt(c.id.slice(3), 10))) + 1;
    return 'TC-' + String(n).padStart(2, '0');
  };
  const newRunId = (task: AiTask) => {
    const id = 'VR-' + (task === 'dups' ? 'CP' : '482') + '-' + task.toUpperCase() + '-' + String(S().runSeq).padStart(3, '0');
    set(s => { s.runSeq++; });
    return id;
  };
  const aiLog = (p: Provenance, what: string, detail: string, flowTag: string, cat: AuditEvent['cat'] = 'AI runs') => {
    const prov = PROVIDER_LABEL[p.prov];
    S().log('ai', what, (detail ? detail + ' · ' : '') + prov + ' · run ' + p.runId, flowTag || prov, 'p-ac', cat);
  };
  const casesFrom = (o: GenReply): TestCase[] => o.test_cases.map((t, i) => ({
    id: 'TC-' + String(i + 1).padStart(2, '0'), title: String(t.title), type: t.type as TestCase['type'], pri: t.priority, file: t.linked_file || '',
    src: (ENUM.source.includes(t.source) ? t.source : 'diff') as TestCase['src'], mod: t.module, pre: t.preconditions || '',
    steps: t.steps.map(String), exp: String(t.expected_result), edited: false, promoted: false, r: newResult()
  }));
  const modsFrom = (o: GenReply) => o.modules.map(m => ({ id: m.id, name: m.name, risk: m.risk, desc: m.description || '' }));

  /** Applies a validated AI reply. Mirrors backend/app/ai/apply.py. */
  const APPLY = {
    gen(o: GenReply, p: Provenance) {
      const commits = PRS[0].commits.filter(c => S().sel[c.hash]);
      const files = commits.reduce((n, c) => n + c.files, 0);
      set(s => {
        s.cycle = { status: 'Tests Generated', cases: casesFrom(o), mods: modsFrom(o), summary: o.change_summary,
          suggest: (o.regression_suggestions || []).map(x => x.regression_id), genAi: p, tester: '', due: '', dueLabel: '',
          aiRuns: 0, ai: null, changeComment: '', approvedNote: '', approvedAt: '' };
        s.suggAdded = {}; s.modal = null;
      });
      S().log('dev', 'Created the cycle and pulled PR #482 from Azure DevOps', `${plural(commits.length, 'commit')} · ${files} files`, 'Draft', 'p-nr', 'Workflow');
      aiLog(p, `Generated ${plural(S().cycle!.cases.length, 'test case')}`, '', 'Draft → Tests Generated');
      S().toast(`${plural(S().cycle!.cases.length, 'test case')} drafted. Review and edit them before assigning.`);
      go('/cycles/482/review');
    },
    regen(o: GenReply, p: Provenance) {
      const c = S().cycle!;
      const keep = c.cases.filter(t => t.edited || t.src === 'manual' || Object.values(S().suggAdded).includes(t.id));
      const keepIds = keep.map(t => t.id);
      const out = casesFrom(o).map(f => (keepIds.includes(f.id) ? keep.find(t => t.id === f.id)! : f));
      keep.filter(t => !out.includes(t)).forEach(t => out.push(t));
      set(s => {
        Object.assign(s.cycle!, { cases: structuredClone(out), mods: modsFrom(o), summary: o.change_summary,
          suggest: (o.regression_suggestions || []).map(x => x.regression_id), genAi: p });
        s.modal = null;
      });
      aiLog(p, `Regenerated test cases: ${out.length} in total`, `${plural(keep.length, 'edited or added case')} kept`, '');
      S().toast(`Regenerated. ${plural(keep.length, 'case')} you edited or added were kept.`);
    },
    validate(o: ValidateReply, p: Provenance) {
      const first = S().cycle!.status === 'Submitted';
      set(s => {
        const c = s.cycle!;
        c.aiRuns++;
        c.ai = {
          consistency: o.result_consistency.map(x => ({ id: x.case_id, why: x.reason || '' })),
          gaps: o.evidence_gaps.map(x => ({ id: x.case_id, why: x.reason || '' })),
          explain: Object.fromEntries(o.failures_and_blocked.map(x => [x.case_id, x.explanation || ''])),
          summary: o.summary || '', p
        };
        if (first) c.status = 'AI Reviewed';
        s.modal = null;
      });
      const R = analyze(S().cycle!);
      aiLog(p, `${first ? 'Ran' : 'Re-ran'} validation: readiness ${R.score} / 100`, `${plural(R.obs, 'observation')}, ${plural(R.cnt.fail, 'failure')}, ${R.cnt.blocked} blocked`, first ? 'Submitted → AI Reviewed' : '');
      const onReport = S().role === 'dev' && currentPath().endsWith('/report');
      S().toast(`AI validation finished: readiness ${R.score} / 100`, onReport ? undefined : (S().role === 'dev' ? 'Open report' : 'Switch to Daniel'), onReport ? undefined : 'report');
    },
    bug(o: BugReply, p: Provenance) {
      aiLog(p, `Drafted a bug for ${S().cycle!.cases[S().runIdx].id}`, '', '', 'Results');
      set(s => { s.modal = { type: 'bug', draft: o, p }; });
    },
    dups(o: DupsReply, p: Provenance) {
      set(s => {
        s.regression.forEach(r => { r.dup = ''; r.dupWhy = ''; });
        o.pairs.forEach(pr => {
          const a = s.regression.find(r => r.id === pr.a), b = s.regression.find(r => r.id === pr.b);
          if (a && b) { a.dup = b.id; b.dup = a.id; a.dupWhy = b.dupWhy = pr.reason || ''; }
        });
        s.dupRun = p; s.modal = null;
      });
      S().toast(`${plural(o.pairs.length, 'likely duplicate pair')} found.`);
    }
  };

  const runSteps = (msg: string, steps: string[], ms: number, done: () => void) => {
    set(s => { s.busy = { msg, steps, i: 0 }; });
    const tick = () => {
      const b = S().busy; if (!b) return;
      if (b.i + 1 > steps.length) { set(s => { s.busy = null; }); done(); return; }
      set(s => { s.busy!.i++; });
      setTimeout(tick, ms);
    };
    setTimeout(tick, ms);
  };

  return {
    ...initialState(),

    set: fn => set(fn),

    toast(msg, actLabel, actKey) {
      const id = toastSeq++;
      set(s => { while (s.toasts.length >= 2) s.toasts.shift(); s.toasts.push({ id, msg, actLabel, actKey }); });
      setTimeout(() => S().dismissToast(id), actLabel ? 6000 : 3800);
    },
    dismissToast(id) { set(s => { s.toasts = s.toasts.filter(t => t.id !== id); }); },
    toastAct(key) {
      if (key === 'report') { if (S().role !== 'dev') S().setRole('dev', '/cycles/482/report'); else go('/cycles/482/report'); }
      if (key === 'undo') {
        const d = S().lastDel; if (!d) return;
        set(s => { s.cycle!.cases.splice(d.i, 0, d.t); s.lastDel = null; });
        S().log('dev', `Restored ${d.t.id}`, '', '', '', 'Test cases');
      }
    },
    log(who, what, detail = '', tag = '', tagCls = 'p-ac', cat = 'Workflow') {
      set(s => { s.audit.push({ who, what, detail, tag, tagCls: tagCls || 'p-ac', cat, time: now(), day: dayLabel() }); });
    },

    signIn(role) {
      set(s => { s.busy = { msg: 'Signing in with Microsoft Entra ID…', i: 0 }; });
      setTimeout(() => {
        if (!isDemo) { saveDevSession(role); setDevUser(role); }
        set(s => { s.signedIn = true; s.role = role; s.busy = null; });
        go(home(role));
      }, 900);
    },
    signOut() {
      if (!isDemo) { clearDevSession(); setDevUser('dev'); }
      set(s => { s.signedIn = false; s.role = 'dev'; });
      go('/signin');
    },
    toggleTheme() { set(s => { s.theme = s.theme === 'dark' ? 'light' : 'dark'; }); },
    setRole(r, path) {
      if (!isDemo) { saveDevSession(r); setDevUser(r); }
      set(s => { s.role = r; });
      S().toast(`Now viewing as ${USERS[r].name} (${USERS[r].role})`);
      go(path || home(r));
    },

    linkApp() {
      const m = S().modal; if (!m || m.type !== 'addapp' || !m.repo) return;
      const name = (m.name || m.repo).trim();
      set(s => {
        s.apps.push({ id: m.repo!, name, ini: name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(), path: `${m.org} / ${m.proj} / ${m.repo}`,
          open: 0, reg: 0, last: 'Not yet', rate: null, tag: { label: 'Just linked', cls: 'p-ac' } });
        s.addedApp = true; s.modal = null;
      });
      S().toast(`${name} linked. Verity subscribed to its pull request events.`);
    },

    togglePr(num) {
      const p = PRS.find(x => x.num === num)!;
      const all = p.commits.every(c => S().sel[c.hash]);
      set(s => { p.commits.forEach(c => { s.sel[c.hash] = !all; }); });
    },
    toggleCommit(hash, on) { set(s => { s.sel[hash] = on; }); },

    aiStart(task) {
      const m = S().aiMode[task];
      if (m === 'ask') set(s => { s.modal = { type: 'aichoose', task }; });
      else S().aiRun(task, m);
    },
    aiRun(task, prov) {
      const runId = newRunId(task);
      set(s => { s.modal = null; });
      runSteps(PROVIDER_LABEL[prov] + ' · ' + AI_TASKS[task].name, aiSteps(task, prov), 400, () => {
        const reply = demoReply(task, runId, S().cycle, S().runIdx, S().regression);
        const p: Provenance = { prov, runId, by: S().role, at: now() };
        (APPLY[task === 'regen' ? 'regen' : task] as (o: unknown, p: Provenance) => void)(reply, p);
      });
    },

    saveCase(data) {
      const m = S().modal; if (!m || m.type !== 'case') return;
      const d = { ...data, file: data.file || MODS.find(x => x.id === data.mod)!.name, steps: data.steps.length ? data.steps : ['Describe the first step'] };
      if (m.id) {
        const id = m.id;
        set(s => { const t = s.cycle!.cases.find(x => x.id === id)!; Object.assign(t, d, { edited: true }); s.modal = null; });
        S().log('dev', `Edited ${id}`, d.title, '', '', 'Test cases'); S().toast(`${id} updated.`);
      } else {
        const id = nextCaseId();
        set(s => { s.cycle!.cases.push({ id, src: 'manual', edited: false, promoted: false, r: newResult(), ...d }); s.modal = null; });
        S().log('dev', `Added ${id} manually`, d.title, '', '', 'Test cases'); S().toast(`${id} added.`);
      }
    },
    dupCase(id) {
      const nid = nextCaseId();
      set(s => {
        const cs = s.cycle!.cases, i = cs.findIndex(x => x.id === id), t = cs[i];
        cs.splice(i + 1, 0, { ...structuredClone(t), id: nid, title: t.title + ' (copy)', edited: true, promoted: false, r: newResult() });
      });
      S().log('dev', `Duplicated ${id} as ${nid}`, '', '', '', 'Test cases');
    },
    delCase(id) {
      const cs = S().cycle!.cases, i = cs.findIndex(x => x.id === id), t = structuredClone(cs[i]);
      set(s => { s.lastDel = { t, i }; s.cycle!.cases.splice(i, 1); });
      S().log('dev', `Deleted ${id}`, t.title, '', '', 'Test cases');
      S().toast(`${id} deleted.`, 'Undo', 'undo');
    },
    promoteCase(id) {
      const rid = 'REG-' + S().regNext;
      const t = S().cycle!.cases.find(x => x.id === id)!;
      set(s => {
        s.regNext++; s.regTotal++;
        s.cycle!.cases.find(x => x.id === id)!.promoted = true;
        s.regression.unshift({ id: rid, title: t.title, mod: MODREG[t.mod], pri: t.pri, last: 'Not run', res: 'Not run', hist: 'NNNNNNNNNN', src: 'PR #482', dup: '', dupWhy: '', tags: [] });
      });
      S().log('dev', `Promoted ${id} to the regression suite as ${rid}`, t.title, '', '', 'Test cases');
      S().toast(`${id} added to the regression suite as ${rid}.`);
    },
    addSugg(reg) {
      const sg = SUGG.find(x => x.reg === reg)!;
      const id = nextCaseId();
      set(s => {
        s.cycle!.cases.push({ id, title: sg.title, type: 'Regression', pri: sg.pri, file: MODS.find(m => m.id === sg.mod)!.name, src: 'reg', mod: sg.mod,
          pre: sg.pre + ' Linked to ' + sg.reg + '.', steps: sg.steps.slice(), exp: sg.exp, edited: false, promoted: true, r: newResult() });
        s.suggAdded[reg] = id;
      });
      S().log('dev', `Included regression case ${reg} as ${id}`, sg.title, '', '', 'Test cases');
    },
    addAllSugg() { SUGG.forEach(sg => { if (!S().suggAdded[sg.reg]) S().addSugg(sg.reg); }); },
    assign(tester, due) {
      const dl = due ? new Date(due + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'no date';
      set(s => { Object.assign(s.cycle!, { tester, due, dueLabel: dl, status: 'Assigned' }); });
      S().log('dev', `Assigned ${plural(S().cycle!.cases.length, 'case')} to ${tester}, due ${dl}`, '', 'Tests Generated → Assigned', 'p-ac', 'Workflow');
      S().toast(`${tester} was notified by email and in Teams.`);
    },

    setStatus(k) {
      set(s => { const t = s.cycle!.cases[s.runIdx]; t.r.status = t.r.status === k ? '' : k; });
      ensureInTesting();
      const t = S().cycle!.cases[S().runIdx];
      if (t.r.status) {
        const cls = { pass: 'p-pass', fail: 'p-fail', blocked: 'p-blk', na: 'p-nr' }[t.r.status];
        S().log('tester', `Recorded ${t.id}${t.r.ev.length ? ' · ' + plural(t.r.ev.length, 'file') + ' attached' : ''}${t.r.bug ? ' · linked ' + t.r.bug : ''}`, t.r.actual, RS[t.r.status][0], cls, 'Results');
      }
    },
    fillSample() {
      let n = 0;
      set(s => {
        s.cycle!.cases.forEach(t => {
          if (t.r.status) return;
          const smp = SAMPLE[t.id] || { status: 'pass', actual: 'Matches the expected result.', evidence: [t.id.toLowerCase() + '-result.png'], bug: '' };
          t.r.status = smp.status; t.r.actual = smp.actual; t.r.ev = smp.evidence.slice();
          t.r.bug = smp.bug ? 'AB#' + s.bugSeq++ : ''; t.r.chk = t.steps.map(() => true); n++;
        });
      });
      ensureInTesting();
      S().log('tester', `Recorded ${plural(n, 'result')}`, 'Filled with sample results in the prototype', '', '', 'Results');
      S().toast(`${plural(n, 'case')} filled. Review any case, then Submit for Review.`);
    },
    saveBug(title) {
      const id = 'AB#' + S().bugSeq;
      const t = S().cycle!.cases[S().runIdx];
      set(s => { s.bugSeq++; s.cycle!.cases[s.runIdx].r.bug = id; s.modal = null; });
      S().log('tester', `Created bug ${id} for ${t.id} in Azure DevOps`, title, '', '', 'Results');
      S().toast(`Bug ${id} created in Azure DevOps and linked to PR #482.`);
    },
    submit() {
      setStatus('Submitted');
      S().log('tester', 'Submitted for review', '', 'In Testing → Submitted', 'p-ac', 'Workflow');
      const md = S().aiMode.validate;
      if (md !== 'ask') {
        S().toast(`Submitted. Verity is running AI validation in ${PROVIDER_LABEL[md]}.`);
        setTimeout(() => {
          if (S().cycle?.status !== 'Submitted') return;
          const runId = newRunId('validate');
          APPLY.validate(demoReply('validate', runId, S().cycle, S().runIdx, S().regression) as ValidateReply, { prov: md, runId, by: 'ai', at: now() });
        }, 2400);
      } else S().toast('Submitted. Daniel Okafor will run the AI validation.', 'Switch to Daniel', 'report');
    },

    approve(note) {
      set(s => { Object.assign(s.cycle!, { approvedNote: note, approvedAt: now(), status: 'Approved for UAT' }); s.modal = null; });
      S().log('dev', 'Approved for client UAT', note, 'AI Reviewed → Approved for UAT', 'p-pass', 'Approvals');
      S().log('sys', 'Set the verity/uat-ready check to succeeded on PR #482 in Azure DevOps', '', '', '', 'Approvals');
      S().toast('Approved for client UAT. The client success team was notified.');
    },
    requestChanges(comment) {
      const cm = comment.trim() || 'Please review the AI findings.';
      set(s => { s.cycle!.changeComment = cm; s.cycle!.status = 'Changes Requested'; s.modal = null; });
      S().log('dev', 'Requested changes', cm, 'AI Reviewed → Changes Requested', 'p-blk', 'Approvals');
      S().toast(`Returned to ${S().cycle!.tester}.`);
    },
    openCase(id) { set(s => { s.runIdx = s.cycle!.cases.findIndex(x => x.id === id); }); go('/cycles/482/run'); },
    openAudit() {
      if (!S().cycle) { S().toast('The audit trail starts when the cycle is created.'); return; }
      set(s => { s.drawer = true; s.sawAudit = true; });
    },

    tagSelected(tag) {
      const v = tag.trim().replace(/^#/, '');
      if (v) set(s => { s.regression.forEach(r => { if (s.regSel[r.id] && !r.tags.includes(v)) r.tags.push(v); }); });
      set(s => { s.modal = null; });
      S().toast(`Tagged with #${v}.`);
    },
    archiveSelected() {
      const ids = Object.keys(S().regSel).filter(k => S().regSel[k]);
      set(s => { s.regression = s.regression.filter(r => !ids.includes(r.id)); s.regTotal -= ids.length; s.regSel = {}; });
      S().toast(`${plural(ids.length, 'case')} archived.`);
    },
    exportRegression(rows) {
      download('claims-portal-regression.csv', 'id,title,module,priority,last_run,last_result,source\n' +
        rows.map(r => [r.id, r.title, r.mod, r.pri, r.last, r.res, r.src].map(csv).join(',')).join('\n'));
      S().toast(`Exported ${plural(rows.length, 'case')} to CSV.`);
    },
    mergeDup(keep, drop) {
      set(s => { s.regression = s.regression.filter(r => r.id !== drop); s.regression.forEach(r => { if (r.dup === drop) r.dup = ''; }); s.regTotal--; s.modal = null; });
      S().toast(`Merged. ${drop} archived, ${keep} kept.`);
    },
    exportAudit() {
      download('pr-482-audit.csv', 'time,who,action,detail,tag\n' +
        S().audit.map(e => [e.day + ' ' + e.time, USERS[e.who].name, e.what, e.detail, e.tag].map(csv).join(',')).join('\n'));
    },
    reset() {
      if (!isDemo) clearDevSession();
      set(s => { Object.assign(s, initialState(true)); });
      go('/signin');
    }
  };
}));

/** Convenience: Azure DevOps orgs → projects → repos for the Add App modal (demo source). */
export const adoTree = ADO;
