import { useEffect, useState, type ReactNode } from 'react';
import { useStore, go, adoTree } from '@/store';
import { FLOW, MODS, USERS } from '@/data/demo';
import { I } from '@/lib/icons';
import { plural } from '@/lib/util';
import { analyze } from '@/lib/analyze';
import { AI_TASKS } from '@/ai/tasks';
import { Avatar, ProvLine } from '@/components/ui';
import { isDemo } from '@/config';
import { useAdoOrgs, useAdoProjects, useAdoRepos, useLinkApp, useApps } from '@/api/hooks';
import type { AdoRepo, CaseType, Priority, RoleKey } from '@/types';

/* ---------- walkthrough (demo mode only) ---------- */
export function Guide() {
  const s = useStore();
  if (!isDemo) return null;
  const st = s.cycle ? s.cycle.status : null, idx = st ? FLOW.indexOf(st) : -1;
  const steps: { t: string; done: boolean; role?: RoleKey; h?: string; audit?: boolean; need?: boolean }[] = [
    { t: 'Sign in with Microsoft', done: true },
    { t: 'Daniel: pick PR #482 and generate test cases', done: !!s.cycle, role: 'dev', h: '/apps/claims/cycles/new' },
    { t: 'Daniel: review, edit and assign the cases', done: idx >= 2 || st === 'Changes Requested', role: 'dev', h: '/cycles/482/review', need: !!s.cycle },
    { t: 'Priya: run the cases and submit for review', done: idx >= 4, role: 'tester', h: '/cycles/482/run', need: idx >= 2 || st === 'Changes Requested' },
    { t: 'Daniel: run the AI validation, then approve or request changes', done: st === 'Approved for UAT', role: 'dev', h: '/cycles/482/report', need: idx >= 4 || st === 'Changes Requested' },
    { t: 'Open the audit trail on the cycle', done: s.sawAudit, role: 'dev', h: '/cycles/482/report', audit: true, need: !!s.cycle },
    { t: 'Optional, Sam (Admin): add a new app from Azure DevOps', done: s.addedApp, role: 'admin', h: '/apps', need: true }
  ];
  const curI = steps.findIndex(x => !x.done);
  const doneN = steps.filter(x => x.done).length;
  const goStep = (x: typeof steps[number]) => {
    if (x.role && x.role !== s.role) s.set(y => { y.role = x.role!; });
    if (x.h) go(x.h);
    if (x.audit) setTimeout(() => useStore.getState().openAudit(), 200);
  };
  if (!s.guideOpen) {
    const nx = steps[curI];
    return (
      <div className="guide-min row" style={{ gap: 6, flexWrap: 'nowrap', maxWidth: 'calc(100vw - 40px)' }}>
        {nx
          ? <button type="button" className="btn pri" style={{ maxWidth: 360, overflow: 'hidden' }} disabled={nx.need === false} title="Go to the next walkthrough step" onClick={() => goStep(nx)}>{I.map}<span className="ell">Next: {nx.t}</span></button>
          : <span className="pill p-pass" style={{ height: 38, padding: '0 14px' }}>{I.check}Walkthrough complete</span>}
        <button type="button" className="btn" aria-expanded="false" aria-label="Show all walkthrough steps" onClick={() => s.set(y => { y.guideOpen = true; })}>{doneN}/{steps.length}</button>
      </div>
    );
  }
  return (
    <div className="guide" role="region" aria-label="Walkthrough">
      <button type="button" className="gh" aria-expanded="true" onClick={() => s.set(y => { y.guideOpen = false; })}>{I.map}<span className="b" style={{ flex: 1 }}>Walkthrough · {doneN}/{steps.length}</span><span style={{ fontSize: 12, opacity: 0.85 }}>Hide</span></button>
      <ol>{steps.map((x, i) => (
        <li key={i} className={x.done ? 'done' : i === curI ? 'cur' : ''}>
          <button type="button" disabled={i === 0 || x.need === false} onClick={() => goStep(x)}><span className="n">{x.done ? '✓' : i + 1}</span><span>{x.t}</span></button>
        </li>
      ))}</ol>
      <div className="row" style={{ padding: '8px 14px 12px', justifyContent: 'space-between' }}><span className="sm muted">Click a step to jump there.</span><button type="button" className="btn sm" onClick={s.reset}>Reset demo</button></div>
    </div>
  );
}

/* ---------- audit trail drawer ---------- */
export function AuditDrawer() {
  const s = useStore();
  if (!s.drawer) return null;
  const cats = ['All', 'Workflow', 'Test cases', 'Results', 'AI runs', 'Approvals'];
  const evs = s.audit.filter(e => s.auditFilter === 'All' || e.cat === s.auditFilter);
  const days = [...new Set(evs.map(e => e.day))];
  const close = () => s.set(x => { x.drawer = false; });
  return (
    <>
      <div className="drawer-bg" onClick={close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="audit-t">
        <div className="col" style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--bd)', gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <div className="col" style={{ gap: 4 }}><h2 id="audit-t">Audit trail</h2><span className="s13 muted"><span className="mono" style={{ color: 'var(--ac)' }}>PR #482</span> · Claims Portal · {plural(s.audit.length, 'event')}</span></div>
            <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><button className="btn sm" type="button" onClick={s.exportAudit}>Export CSV</button><button className="ib" type="button" aria-label="Close audit trail" onClick={close}>{I.close}</button></div>
          </div>
          <div className="row" style={{ gap: 6 }}>{cats.map(cat => <button key={cat} type="button" className={`chip ${s.auditFilter === cat ? 'on' : ''}`} onClick={() => s.set(x => { x.auditFilter = cat; })}>{cat}</button>)}</div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 24px 24px' }}>
          {evs.length ? days.map(d => (
            <div key={d}>
              <div className="sm b muted" style={{ letterSpacing: '.05em', textTransform: 'uppercase', padding: '16px 0 8px' }}>{d}</div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {evs.filter(e => e.day === d).map((e, i) => (
                  <li key={i} className="ev">
                    <div className="col" style={{ alignItems: 'center', gap: 0, flex: 'none' }}><Avatar k={e.who} /><span className="rail" /></div>
                    <div className="col" style={{ flex: 1, minWidth: 0, paddingBottom: 18, gap: 4 }}>
                      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap' }}><span className="b">{USERS[e.who].name}</span><span className="mono sm muted">{e.time}</span></div>
                      <span style={{ lineHeight: 1.5 }}>{e.what}</span>
                      {e.detail && <span className="s13 muted" style={{ lineHeight: 1.5 }}>{e.detail}</span>}
                      {e.tag && <span className={`pill ${e.tagCls}`} style={{ alignSelf: 'flex-start' }}>{e.tag}</span>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )) : <p className="muted" style={{ padding: '24px 0' }}>No events yet. Actions on the cycle appear here as they happen.</p>}
        </div>
      </aside>
    </>
  );
}

/* ---------- modals ---------- */
function ModalWrap({ title, sub, children, foot, wide }: { title: ReactNode; sub?: ReactNode; children: ReactNode; foot: ReactNode; wide?: boolean }) {
  const set = useStore(s => s.set);
  const close = () => set(x => { x.modal = null; });
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="m-t" style={wide ? { maxWidth: 720 } : undefined}>
        <div className="mh"><div className="col" style={{ gap: 6 }}><h2 id="m-t">{title}</h2>{sub && <p className="muted" style={{ lineHeight: 1.5 }}>{sub}</p>}</div>
          <button className="ib" type="button" aria-label="Close" onClick={close}>{I.close}</button></div>
        <div className="mb">{children}</div>
        <div className="mf">{foot}</div>
      </div>
    </div>
  );
}
const Cancel = () => { const set = useStore(s => s.set); return <button className="btn" type="button" onClick={() => set(x => { x.modal = null; })}>Cancel</button>; };

export function Modal() {
  const m = useStore(s => s.modal);
  if (!m) return null;
  switch (m.type) {
    case 'aichoose': return <AiChooseModal />;
    case 'addapp': return <AddAppModal />;
    case 'case': return <CaseModal key={m.id || 'new'} />;
    case 'bug': return <BugModal />;
    case 'approve': return <ApproveModal />;
    case 'changes': return <ChangesModal />;
    case 'tag': return <TagModal />;
    case 'merge': return <MergeModal />;
  }
}

function AiChooseModal() {
  const s = useStore();
  const m = s.modal as Extract<typeof s.modal, { type: 'aichoose' }>;
  const T = AI_TASKS[m.task];
  const pick = (prov: 'azure' | 'claude') => {
    if (m.onPick) { s.set(x => { x.modal = null; }); m.onPick!(prov); }
    else s.aiRun(m.task, prov);
  };
  return (
    <ModalWrap title={`Run AI: ${T.name}`} sub="Choose where this step runs. Admins can set a default for each AI step in app settings." foot={<Cancel />}>
      <button type="button" className="aiopt" onClick={() => pick('azure')}><span className="aio-i">{I.cloud}</span>
        <span className="col" style={{ gap: 4, flex: 1 }}><span className="b">Azure OpenAI</span><span className="s13 muted" style={{ lineHeight: 1.5 }}>Automatic. Verity sends the context to your Azure OpenAI deployment and imports the result, usually in under a minute.</span></span></button>
      <button type="button" className="aiopt" onClick={() => pick('claude')}><span className="aio-i">{I.chat}</span>
        <span className="col" style={{ gap: 4, flex: 1 }}><span className="b">Claude</span><span className="s13 muted" style={{ lineHeight: 1.5 }}>Automatic. Verity sends the same context to Claude and imports the result into this cycle. Same prompt and output format as Azure OpenAI.</span></span></button>
      {m.task === 'bug' && (
        <button type="button" className="aiopt" onClick={() => s.set(x => { x.modal = { type: 'bug', draft: null }; })}><span className="aio-i">{I.edit}</span>
          <span className="col" style={{ gap: 4, flex: 1 }}><span className="b">Write it myself</span><span className="s13 muted">Open the bug form with the case details filled in.</span></span></button>
      )}
    </ModalWrap>
  );
}

function AddAppModal() {
  const s = useStore();
  const m = s.modal as Extract<typeof s.modal, { type: 'addapp' }>;
  const upd = (fn: (x: typeof m) => void) => s.set(x => { fn(x.modal as typeof m); });

  // ADO data — queries are disabled in demo mode (enabled: !isDemo in hooks.ts)
  const { data: orgsData } = useAdoOrgs();
  const { data: projectsData } = useAdoProjects(m.org);
  const { data: reposData } = useAdoRepos(m.org, m.proj);
  const linkMutation = useLinkApp();
  const { data: apiApps } = useApps();

  // Auto-populate first org when orgs load in api mode
  useEffect(() => {
    if (!isDemo && orgsData?.length && !m.org) {
      s.set(x => { (x.modal as typeof m).org = orgsData[0]; });
    }
  }, [orgsData, m.org]);

  // Auto-populate first project when projects load or change in api mode
  useEffect(() => {
    if (!isDemo && projectsData?.length && !projectsData.includes(m.proj)) {
      s.set(x => { (x.modal as typeof m).proj = projectsData[0]; (x.modal as typeof m).repo = null; (x.modal as typeof m).name = ''; });
    }
  }, [projectsData, m.proj]);

  const orgs: string[] = isDemo ? Object.keys(adoTree) : (orgsData ?? []);
  const projects: string[] = isDemo ? Object.keys(adoTree[m.org] || {}) : (projectsData ?? []);
  const repos: AdoRepo[] = isDemo ? (adoTree[m.org]?.[m.proj] ?? []) : (reposData ?? []);
  const linked = (r: string) => isDemo
    ? s.apps.some(a => a.path === `${m.org} / ${m.proj} / ${r}`)
    : (apiApps ?? []).some(a => a.path === `${m.org} / ${m.proj} / ${r}`);

  const handleLinkApp = () => {
    if (isDemo) { s.linkApp(); return; }
    if (!m.repo) return;
    const appName = (m.name || m.repo).trim();
    linkMutation.mutate(
      { org: m.org, project: m.proj, repo: m.repo, name: appName, branch: m.branch },
      {
        onSuccess: () => { s.set(x => { x.modal = null; }); s.toast(`${appName} linked. Verity subscribed to its pull request events.`); },
        onError: (e) => { s.toast(`Link failed: ${(e as Error).message}`); },
      }
    );
  };

  return (
    <ModalWrap title="Add app from Azure DevOps" sub="Pick the repository Verity should read pull requests from. You only see repositories you can access."
      foot={<><Cancel /><button className="btn pri" type="button" disabled={!m.repo || linkMutation.isPending} onClick={handleLinkApp}>Link app</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <label className="f">Organization<select className="input" value={m.org} onChange={e => { const v = e.target.value; upd(x => { x.org = v; x.proj = isDemo ? Object.keys(adoTree[v])[0] : ''; x.repo = null; x.name = ''; }); }}>{orgs.map(o => <option key={o}>{o}</option>)}</select></label>
        <label className="f">Project<select className="input" value={m.proj} onChange={e => { const v = e.target.value; upd(x => { x.proj = v; x.repo = null; x.name = ''; }); }}>{projects.map(p => <option key={p}>{p}</option>)}</select></label>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="s13" style={{ fontWeight: 500 }}>Repository</span><span className="sm muted">{plural(repos.length, 'repository')}</span></div>
        <div style={{ border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden' }}>
          {repos.map(r => (
            <button key={r.name} type="button" className={`repo ${m.repo === r.name ? 'on' : ''}`} disabled={linked(r.name)}
              onClick={() => upd(x => { x.repo = r.name; x.branch = r.branch; x.name = r.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '); })}>
              <span className="radio" /><span className="col" style={{ flex: 1, gap: 2, minWidth: 0 }}><span className="mono" style={{ fontWeight: 500 }}>{r.name}</span><span className="sm muted">{r.updated} · default branch {r.branch}</span></span>
              {linked(r.name) && <span className="pill p-nr">Already linked</span>}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <label className="f">App name<input className="input" value={m.name} placeholder="Pick a repository" onChange={e => { const v = e.target.value; upd(x => { x.name = v; }); }} /></label>
        <label className="f">Target branch for cycles<input className="input mono" value={m.branch} readOnly /></label>
      </div>
    </ModalWrap>
  );
}

function CaseModal() {
  const s = useStore();
  const m = s.modal as Extract<typeof s.modal, { type: 'case' }>;
  const t = m.id ? s.cycle!.cases.find(x => x.id === m.id)! : { title: '', type: 'Functional' as CaseType, pri: 'P2' as Priority, file: '', pre: '', steps: [] as string[], exp: '', mod: 'settle' };
  const [f, setF] = useState({ title: t.title, type: t.type, pri: t.pri, mod: t.mod, file: t.file, pre: t.pre, steps: t.steps.join('\n'), exp: t.exp });
  const ch = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => s.saveCase({ title: f.title.trim() || 'Untitled test case', type: f.type, pri: f.pri, mod: f.mod, file: f.file.trim(), pre: f.pre.trim(), steps: f.steps.split('\n').map(x => x.trim()).filter(Boolean), exp: f.exp.trim() });
  return (
    <ModalWrap title={m.id ? 'Edit ' + m.id : 'Add test case manually'} sub={m.id ? 'Changes are tracked in the audit trail.' : 'Manual cases are reviewed and assigned like generated ones.'}
      foot={<><Cancel /><button className="btn pri" type="button" onClick={save}>{m.id ? 'Save changes' : 'Add test case'}</button></>}>
      <label className="f">Title<input className="input" value={f.title} onChange={ch('title')} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
        <label className="f">Type<select className="input" value={f.type} onChange={ch('type')}>{['Functional', 'Edge case', 'Negative', 'Regression'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="f">Priority<select className="input" value={f.pri} onChange={ch('pri')}>{['P1', 'P2', 'P3'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="f">Module<select className="input" value={f.mod} onChange={ch('mod')}>{MODS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <label className="f">Linked file or module<input className="input mono" value={f.file} onChange={ch('file')} /></label>
      <label className="f">Preconditions<textarea className="input" rows={2} value={f.pre} onChange={ch('pre')} /></label>
      <label className="f">Steps (one per line)<textarea className="input" rows={4} value={f.steps} onChange={ch('steps')} /></label>
      <label className="f">Expected result<textarea className="input" rows={2} value={f.exp} onChange={ch('exp')} /></label>
    </ModalWrap>
  );
}

function BugModal() {
  const s = useStore();
  const m = s.modal as Extract<typeof s.modal, { type: 'bug' }>;
  const t = s.cycle!.cases[s.runIdx];
  const dr = m.draft;
  const [title, setTitle] = useState(dr ? dr.title : t.id + ' failed: ' + t.title);
  const repro = dr ? dr.repro_steps : 'Preconditions: ' + t.pre + '\n' + t.steps.map((x, i) => (i + 1) + '. ' + x).join('\n') + '\nExpected: ' + t.exp + '\nActual: ' + (t.r.actual || '(not entered yet)');
  return (
    <ModalWrap title="Create bug in Azure DevOps"
      sub={<>Verity creates the work item in contoso-health / Claims and links it to PR #482.{dr && <><br /><span className="prov">Drafted by AI: <ProvLine p={m.p} />. Review before creating.</span></>}</>}
      foot={<><Cancel /><button className="btn pri" type="button" onClick={() => s.saveBug(title)}>Create bug</button></>}>
      <label className="f">Title<input className="input" value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="f">Repro steps<textarea className="input" rows={6} defaultValue={repro} /></label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <label className="f">Severity<select className="input" defaultValue={dr ? dr.severity : '3 - Medium'}>{['1 - Critical', '2 - High', '3 - Medium', '4 - Low'].map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="f">Area path<input className="input" defaultValue={dr && dr.area_path ? dr.area_path : 'Claims\\Settlement'} /></label>
      </div>
      <span className="s13 muted">{t.r.ev.length ? plural(t.r.ev.length, 'evidence file') + ' will be attached.' : 'No evidence attached yet.'}</span>
    </ModalWrap>
  );
}

function ApproveModal() {
  const s = useStore();
  const m = s.modal as Extract<typeof s.modal, { type: 'approve' }>;
  const [note, setNote] = useState('');
  const R = analyze(s.cycle!);
  const items = [R.obs ? plural(R.obs, 'observation') : '', R.cnt.fail ? plural(R.cnt.fail, 'failure') : '', R.cnt.blocked ? plural(R.cnt.blocked, 'blocked case') : ''].filter(Boolean);
  return (
    <ModalWrap title="Approve PR #482 for client UAT?" sub={`Readiness ${R.score} / 100 · ${R.verdict}.`}
      foot={<><Cancel /><button className="btn pri" type="button" disabled={items.length > 0 && !m.ok} onClick={() => s.approve(note.trim())}>Approve for Client UAT</button></>}>
      <label className="f">Note for the client (optional)<textarea className="input" rows={3} placeholder="e.g. Rounding of sub-cent amounts is a known issue, fix planned in 2026.11.1" value={note} onChange={e => setNote(e.target.value)} /></label>
      {items.length > 0 && (
        <label className="row s13" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap', lineHeight: 1.45 }}>
          <input type="checkbox" checked={m.ok} style={{ marginTop: 1 }} onChange={e => { const v = e.target.checked; s.set(x => { (x.modal as typeof m).ok = v; }); }} />
          I reviewed the {items.join(', ')} and accept them for UAT.</label>
      )}
      <div className="banner b-gray s13">{I.info}<span>Your approval is recorded in the audit trail and posted to the pull request in Azure DevOps.</span></div>
    </ModalWrap>
  );
}

function ChangesModal() {
  const s = useStore();
  const c = s.cycle!;
  const R = analyze(c);
  const parts: string[] = [];
  R.gaps.forEach(x => parts.push(`attach evidence for ${x.id}`));
  R.consistency.forEach(x => parts.push(`re-check ${x.id}, the actual result does not fully support Pass`));
  R.issues.filter(x => x.r.status === 'blocked').forEach(x => parts.push(`try ${x.id} again in staging`));
  const [cm, setCm] = useState(parts.length ? 'Please ' + parts.join('; ') + '.' : '');
  return (
    <ModalWrap title="Request changes" sub={`The cycle goes back to ${c.tester} as In Testing with your comment.`}
      foot={<><Cancel /><button className="btn warn" type="button" onClick={() => s.requestChanges(cm)}>Request Changes</button></>}>
      <label className="f">Comment to tester<textarea className="input" rows={5} value={cm} onChange={e => setCm(e.target.value)} /></label>
    </ModalWrap>
  );
}

function TagModal() {
  const s = useStore();
  const [v, setV] = useState('refunds');
  return (
    <ModalWrap title="Tag selected cases" sub="Tags help filter and build targeted regression runs."
      foot={<><Cancel /><button className="btn pri" type="button" onClick={() => s.tagSelected(v)}>Add tag</button></>}>
      <label className="f">Tag<input className="input" placeholder="e.g. refunds" value={v} onChange={e => setV(e.target.value)} /></label>
    </ModalWrap>
  );
}

function MergeModal() {
  const s = useStore();
  const m = s.modal as Extract<typeof s.modal, { type: 'merge' }>;
  const a = s.regression.find(r => r.id === m.id)!, b = s.regression.find(r => r.id === a.dup)!;
  const keep = a.hist.replace(/N/g, '').length >= b.hist.replace(/N/g, '').length ? a : b, drop = keep === a ? b : a;
  return (
    <ModalWrap title="Merge duplicate regression cases" sub="Verity keeps the case with the longer run history and archives the other. Run history and source links are combined."
      foot={<><Cancel /><button className="btn pri" type="button" onClick={() => s.mergeDup(keep.id, drop.id)}>Merge</button></>}>
      <div className="cmp">
        <div style={{ border: '2px solid var(--ps)' }}><div className="lbl" style={{ color: 'var(--ps)' }}>Keep</div><span className="mono sm">{keep.id}</span><div className="b">{keep.title}</div></div>
        <div><div className="lbl">Archive</div><span className="mono sm">{drop.id}</span><div className="b">{drop.title}</div></div>
      </div>
    </ModalWrap>
  );
}

/* ---------- busy overlay + toasts ---------- */
export function Busy() {
  const b = useStore(s => s.busy);
  if (!b) return null;
  return (
    <div className="busy" role="alertdialog" aria-live="assertive"><div className="box">
      <div className="row" style={{ gap: 12, flexWrap: 'nowrap' }}><div className="spin" /><h3>{b.msg}</h3></div>
      {b.steps && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {b.steps.map((x, i) => (
            <li key={i} className="row s13" style={{ gap: 10, flexWrap: 'nowrap', color: i < b.i ? 'var(--tx)' : 'var(--mu)' }}>
              <span style={{ width: 18, display: 'inline-grid', color: i < b.i ? 'var(--ps)' : 'var(--mu)' }}>{i < b.i ? I.check : i === b.i ? '•' : ''}</span>{x}
            </li>
          ))}
        </ol>
      )}
    </div></div>
  );
}

export function Toasts() {
  const toasts = useStore(s => s.toasts);
  const { toastAct, dismissToast } = useStore.getState();
  return (
    <div id="toast" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className="toast"><span>{t.msg}</span>
          {t.actLabel && <button type="button" onClick={() => { dismissToast(t.id); toastAct(t.actKey); }}>{t.actLabel}</button>}</div>
      ))}
    </div>
  );
}

/** Escape closes the top-most overlay, like the prototype. */
export function useEscape() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const st = useStore.getState();
      if (st.modal) st.set(x => { x.modal = null; }); else if (st.drawer) st.set(x => { x.drawer = false; });
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
}
