import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '@/store';
import { PRS } from '@/data/demo';
import { I } from '@/lib/icons';
import { AdoLink, Empty, Stepper } from '@/components/ui';
import { isDemo } from '@/config';
import { useApp, usePullRequests } from '@/api/hooks';
import { api } from '@/api/client';
import { AI_TASKS, PROVIDER_LABEL, aiSteps } from '@/ai/tasks';
import type { AiProviderKey, ApiJob } from '@/types';

export function NewCycle() {
  const { appId = '' } = useParams();
  const s = useStore();
  const role = useStore(x => x.role);
  const { set: storeSet, toast } = useStore.getState();
  const navigate = useNavigate();

  // API hooks — disabled in demo via enabled: !isDemo
  const { data: apiApp } = useApp(appId);
  const { data: apiPRs = [], isLoading: prsLoading, refetch: refetchPRs } = usePullRequests(appId);

  // API mode local state (not used in demo)
  const [selPRs, setSelPRs] = useState<Record<number, boolean>>({});
  const [selCommits, setSelCommits] = useState<Record<string, boolean>>({});
  const [openedPRs, setOpenedPRs] = useState<Record<number, boolean>>({});
  const [cycleName, setCycleName] = useState('');
  const [cycleNameAutoFilled, setCycleNameAutoFilled] = useState(false);
  const [genError, setGenError] = useState<string[] | null>(null);
  const [draftCycleId, setDraftCycleId] = useState<string | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-select first non-cycle PR when list loads in api mode
  useEffect(() => {
    if (isDemo || apiPRs.length === 0 || Object.keys(selPRs).length > 0) return;
    const first = apiPRs.find(p => !p.inCycle);
    if (first) {
      setOpenedPRs({ [first.num]: true });
      setSelPRs({ [first.num]: true });
      setSelCommits(Object.fromEntries(first.commits.map(c => [c.hash, true])));
      if (first.draftId) setDraftCycleId(first.draftId);
    }
  }, [apiPRs]);

  // Pre-fill cycle name from first selected PR (once, before user types)
  useEffect(() => {
    if (isDemo || cycleNameAutoFilled) return;
    const firstTitle = computeDefaultName(apiPRs, selPRs);
    if (firstTitle) {
      setCycleName(firstTitle);
      setCycleNameAutoFilled(true);
    }
  }, [apiPRs, selPRs, cycleNameAutoFilled]);

  // Cleanup polling on unmount
  useEffect(() => () => { if (jobPollRef.current) clearTimeout(jobPollRef.current); }, []);

  if (isDemo) {
    // ---- DEMO MODE — unchanged from original ----
    if (s.role !== 'dev') return (
      <div className="wrap"><Empty title="Senior developers start test cycles"
        action={<button className="btn pri" type="button" onClick={() => s.setRole('dev', '/apps/claims/cycles/new')}>Switch to Daniel Okafor</button>}>
        Switch to Daniel Okafor to create a cycle from a pull request.</Empty></div>
    );
    let prs = 0, commits = 0, files = 0, firstTitle = '';
    const cards = PRS.map(p => {
      const inCycle = p.inCycle || (p.num === 482 && !!s.cycle);
      const chosen = inCycle ? [] : p.commits.filter(c => s.sel[c.hash]);
      if (chosen.length) { prs++; if (!firstTitle) firstTitle = 'PR #' + p.num + ' · ' + p.title; }
      commits += chosen.length; chosen.forEach(c => { files += c.files; });
      const open = !!s.openPR[p.num] && !inCycle;
      return (
        <div key={p.num} className={`pr ${chosen.length ? 'sel' : ''} ${inCycle ? 'dis' : ''}`}>
          <div className="pr-h">
            <div style={{ paddingTop: 2 }}><input type="checkbox" checked={chosen.length > 0} disabled={inCycle} aria-label={`Include PR ${p.num}`} onChange={() => s.togglePr(p.num)} /></div>
            <div className="col" style={{ flex: 1, minWidth: 0, gap: 8 }}>
              <div className="row" style={{ gap: 10 }}>
                <span className="mono s13" style={{ color: 'var(--ac)', fontWeight: 500 }}>#{p.num}</span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</span>
                {inCycle && <span className="pill p-nr">Already in a cycle</span>}
              </div>
              <div className="row s13 muted" style={{ gap: '6px 16px' }}>
                <span>{p.author}</span><span className="mono sm">{p.branch} → main</span><span>Opened {p.created}</span>
                <span>{inCycle ? '' : p.commits.length + ' commits'}</span>
                <span className="row" style={{ gap: 6 }}>{p.items.map(w => <AdoLink key={w} className="mono sm" style={{ padding: '1px 7px', borderRadius: 6, border: '1px solid var(--bd)', color: 'var(--tx)', textDecoration: 'none' }}>{w}</AdoLink>)}</span>
              </div>
            </div>
            {!inCycle && (
              <button className="ib" type="button" aria-expanded={open} aria-label={`Show commits for PR ${p.num}`} style={{ borderColor: 'var(--bd)' }}
                onClick={() => s.set(x => { x.openPR[p.num] = !x.openPR[p.num]; })}>
                <span style={{ display: 'inline-grid', transform: open ? 'rotate(180deg)' : 'none' }}>{I.chev}</span>
              </button>
            )}
          </div>
          {open && (
            <div className="scroll" style={{ borderTop: '1px solid var(--bd)', background: 'var(--sf2)' }}>
              <table className="t" style={{ minWidth: 740 }}>
                <thead><tr><th style={{ width: 40 }} /><th style={{ width: 90 }}>Commit</th><th>Message and AI commit notes</th><th style={{ width: 120 }}>Author</th><th style={{ width: 60, textAlign: 'right' }}>Files</th></tr></thead>
                <tbody>
                  {p.commits.map(c => (
                    <tr key={c.hash} style={{ verticalAlign: 'top' }}>
                      <td style={{ background: 'var(--sf2)' }}><input type="checkbox" checked={!!s.sel[c.hash]} aria-label={`Include commit ${c.hash}`} onChange={e => s.toggleCommit(c.hash, e.target.checked)} /></td>
                      <td className="mono s13" style={{ color: 'var(--ac)', background: 'var(--sf2)' }}>{c.hash}</td>
                      <td style={{ background: 'var(--sf2)' }}>
                        <div style={{ fontWeight: 500 }}>{c.message}</div>
                        {c.aiNote
                          ? <div className="row s13 muted" style={{ marginTop: 6, gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}><span className="ai-note">AI note</span><span style={{ lineHeight: 1.5 }}>{c.aiNote}</span></div>
                          : <div className="s13 muted" style={{ marginTop: 6 }}>No AI commit notes</div>}
                      </td>
                      <td className="s13" style={{ background: 'var(--sf2)' }}>{c.author}</td>
                      <td className="mono s13" style={{ textAlign: 'right', background: 'var(--sf2)' }}>{c.files}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    });

    return (
      <>
        <div className="sub"><div className="wrap col" style={{ gap: 16 }}>
          <div className="crumb"><Link to="/apps">Apps</Link><span>/</span><Link to="/apps/claims">Claims Portal</Link><span>/</span><span style={{ color: 'var(--tx)' }}>New test cycle</span></div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div className="col" style={{ gap: 6 }}><h1>New test cycle</h1><p className="muted">Choose the pull requests and commits to test. Verity reads their diffs, commit notes and linked work items.</p></div>
            <span className="row s13 muted" style={{ gap: 8 }}><span className="dot" style={{ background: 'var(--ps)' }} />Synced with Azure DevOps 2 min ago
              <button className="ib" type="button" aria-label="Sync now" onClick={() => s.toast('Synced with Azure DevOps. No new pull requests.')}>{I.refresh}</button></span>
          </div>
          <Stepper st="Draft" />
        </div></div>
        <div className="wrap split">
          <section className="main">
            <div className="row"><h2 style={{ fontSize: 16 }}>Active pull requests</h2><span className="s13 muted">into main · {PRS.length} open</span><div className="sp" />
              <label className="searchbox" style={{ width: 260 }}>{I.search}<input type="search" placeholder="Search PRs or work items" aria-label="Search pull requests" /></label></div>
            {cards}
          </section>
          <aside className="side"><div className="card pad col" style={{ gap: 18 }}>
            <h3>Cycle scope</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
              {([[prs, 'PRs'], [commits, 'Commits'], [files, 'Files changed']] as const).map(k => (
                <div key={k[1]} style={{ padding: 12, borderRadius: 10, background: 'var(--sf2)' }} className="col">
                  <span style={{ fontSize: 22, fontWeight: 600 }}>{k[0]}</span><span className="sm muted" style={{ marginTop: -12 }}>{k[1]}</span>
                </div>
              ))}
            </div>
            <label className="f">Cycle name<input className="input" key={firstTitle} defaultValue={firstTitle || 'Untitled cycle'} /></label>
            <div className="col" style={{ gap: 10 }}><span className="s13" style={{ fontWeight: 500 }}>AI will use</span>
              {['Code diffs', 'AI commit notes', 'Linked work item acceptance criteria', 'Match against regression suite (' + s.regTotal + ')'].map(x =>
                <label key={x} className="row" style={{ gap: 10 }}><input type="checkbox" defaultChecked />{x}</label>)}
            </div>
            <button className="btn pri lg" type="button" disabled={!commits} onClick={() => s.aiStart('gen')}>{I.spark}{commits ? 'Generate Test Cases with AI' : 'Select at least one commit'}</button>
            <p className="sm muted" style={{ lineHeight: 1.5 }}>Generated test cases are drafts. You review and edit every case before assigning a tester.</p>
          </div></aside>
        </div>
      </>
    );
  }

  // ---- API MODE ----

  if (role !== 'dev') return (
    <div className="wrap"><Empty title="Senior developers start test cycles"
      action={<button className="btn pri" type="button" onClick={() => s.setRole('dev', `/apps/${appId}/cycles/new`)}>Switch to Daniel Okafor</button>}>
      Switch to Daniel Okafor to create a cycle from a pull request.</Empty></div>
  );

  const appName = apiApp?.name ?? '…';
  const targetBranch = apiApp?.target_branch ?? 'main';
  const aiInputs: Record<string, boolean> = {
    diffs: true, commit_notes: true, work_items: true, regression: true,
    ...(apiApp?.ai_inputs as Record<string, boolean> | undefined ?? {}),
  };

  // Toggle a whole PR (all its commits on/off)
  const togglePR = (num: number) => {
    const pr = apiPRs.find(p => p.num === num);
    if (!pr || pr.inCycle) return;
    const allOn = pr.commits.every(c => selCommits[c.hash]);
    const newOn = !allOn;
    setSelPRs(prev => ({ ...prev, [num]: newOn }));
    setSelCommits(prev => {
      const next = { ...prev };
      pr.commits.forEach(c => { next[c.hash] = newOn; });
      return next;
    });
  };

  const toggleCommit = (prNum: number, hash: string, on: boolean) => {
    setSelCommits(prev => {
      const next = { ...prev, [hash]: on };
      const pr = apiPRs.find(p => p.num === prNum);
      if (pr) {
        setSelPRs(sp => ({ ...sp, [prNum]: pr.commits.every(c => next[c.hash]) }));
      }
      return next;
    });
  };

  // Compute sidebar stats
  let apiPRCount = 0, apiCommitCount = 0, apiFileCount = 0;
  apiPRs.forEach(pr => {
    if (pr.inCycle) return;
    const chosen = pr.commits.filter(c => selCommits[c.hash]);
    if (chosen.length) {
      apiPRCount++;
      apiCommitCount += chosen.length;
      chosen.forEach(c => { apiFileCount += c.files; });
    }
  });

  const handleGenerate = async (prov: AiProviderKey) => {
    setGenError(null);
    const prNumbers = apiPRs.filter(p => !p.inCycle && selPRs[p.num]).map(p => p.num);
    const commitShas = apiPRs.flatMap(p =>
      !p.inCycle && selPRs[p.num] ? p.commits.filter(c => selCommits[c.hash]).map(c => c.hash) : []
    );
    if (!commitShas.length) return;

    const name = cycleName.trim() || computeDefaultName(apiPRs, selPRs) || 'Untitled cycle';
    let cycleId = draftCycleId;
    try {
      if (!cycleId) {
        const cycleData = await api.createCycle(appId, { name, pr_numbers: prNumbers, commit_shas: commitShas }) as { id: string };
        cycleId = cycleData.id;
        setDraftCycleId(cycleId);
      }

      const jobData = await api.runAi(cycleId, 'gen', prov) as { job_id: string };
      const steps = aiSteps('gen', prov);
      storeSet(x => { x.busy = { msg: `${PROVIDER_LABEL[prov]} · ${AI_TASKS.gen.name}`, steps, i: 0 }; });

      const poll = async () => {
        try {
          const job: ApiJob = await api.aiJob(jobData.job_id);
          storeSet(x => { if (x.busy) x.busy.i = job.step; });
          if (job.status === 'succeeded') {
            storeSet(x => { x.busy = null; });
            const count = (job.result as { case_count?: number } | null)?.case_count ?? 0;
            toast(`${count} test case${count !== 1 ? 's' : ''} drafted. Review and edit them before assigning.`);
            navigate(`/cycles/${cycleId}/review`);
          } else if (job.status === 'failed') {
            storeSet(x => { x.busy = null; });
            const err = job.error as { errors?: string[]; message?: string } | string | null;
            const msgs = Array.isArray((err as { errors?: string[] })?.errors)
              ? (err as { errors: string[] }).errors
              : [typeof err === 'string' ? err : (err as { message?: string })?.message ?? 'Generation failed.'];
            setGenError(msgs);
          } else {
            jobPollRef.current = setTimeout(poll, 1000);
          }
        } catch (e) {
          storeSet(x => { x.busy = null; });
          setGenError([(e as Error).message || 'Network error while polling job status.']);
        }
      };
      poll();
    } catch (e) {
      setGenError([(e as Error).message || 'Failed to start generation.']);
    }
  };

  const startGen = () => {
    const mode = apiApp?.ai_modes?.gen ?? 'ask';
    if (mode === 'ask') {
      storeSet(x => { x.modal = { type: 'aichoose', task: 'gen', onPick: handleGenerate }; });
    } else {
      handleGenerate(mode as AiProviderKey);
    }
  };

  const handleDiscard = async () => {
    if (!draftCycleId) return;
    try {
      await api.deleteDraftCycle(appId, draftCycleId);
      setGenError(null);
      setDraftCycleId(null);
      refetchPRs();
    } catch (e) {
      setGenError([(e as Error).message || 'Failed to discard draft.']);
    }
  };

  const aiInputLabels: [string, string][] = [
    ['diffs', 'Code diffs'],
    ['commit_notes', 'AI commit notes'],
    ['work_items', 'Linked work item acceptance criteria'],
    ['regression', `Match against regression suite (${apiApp?.reg ?? 0})`],
  ];

  const apiCards = apiPRs.map(p => {
    const chosenCount = p.inCycle ? 0 : p.commits.filter(c => selCommits[c.hash]).length;
    const open = !!openedPRs[p.num] && !p.inCycle;
    return (
      <div key={p.num} className={`pr ${chosenCount > 0 ? 'sel' : ''} ${p.inCycle ? 'dis' : ''}`}>
        <div className="pr-h">
          <div style={{ paddingTop: 2 }}><input type="checkbox" checked={chosenCount > 0} disabled={p.inCycle} aria-label={`Include PR ${p.num}`} onChange={() => togglePR(p.num)} /></div>
          <div className="col" style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="mono s13" style={{ color: 'var(--ac)', fontWeight: 500 }}>#{p.num}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{p.title}</span>
              {p.inCycle && <span className="pill p-nr">Already in a cycle</span>}
              {!p.inCycle && p.draftId && <span className="pill p-bk">Draft cycle</span>}
            </div>
            <div className="row s13 muted" style={{ gap: '6px 16px' }}>
              <span>{p.author}</span><span className="mono sm">{p.branch} → {targetBranch}</span><span>Opened {p.created}</span>
              <span>{p.inCycle ? '' : p.commits.length + ' commits'}</span>
              <span className="row" style={{ gap: 6 }}>{p.items.map(w => <AdoLink key={w} className="mono sm" style={{ padding: '1px 7px', borderRadius: 6, border: '1px solid var(--bd)', color: 'var(--tx)', textDecoration: 'none' }}>{w}</AdoLink>)}</span>
            </div>
          </div>
          {!p.inCycle && (
            <button className="ib" type="button" aria-expanded={open} aria-label={`Show commits for PR ${p.num}`} style={{ borderColor: 'var(--bd)' }}
              onClick={() => setOpenedPRs(prev => ({ ...prev, [p.num]: !prev[p.num] }))}>
              <span style={{ display: 'inline-grid', transform: open ? 'rotate(180deg)' : 'none' }}>{I.chev}</span>
            </button>
          )}
        </div>
        {open && (
          <div className="scroll" style={{ borderTop: '1px solid var(--bd)', background: 'var(--sf2)' }}>
            <table className="t" style={{ minWidth: 740 }}>
              <thead><tr><th style={{ width: 40 }} /><th style={{ width: 90 }}>Commit</th><th>Message and AI commit notes</th><th style={{ width: 120 }}>Author</th><th style={{ width: 60, textAlign: 'right' }}>Files</th></tr></thead>
              <tbody>
                {p.commits.map(c => (
                  <tr key={c.hash} style={{ verticalAlign: 'top' }}>
                    <td style={{ background: 'var(--sf2)' }}><input type="checkbox" checked={!!selCommits[c.hash]} aria-label={`Include commit ${c.hash}`} onChange={e => toggleCommit(p.num, c.hash, e.target.checked)} /></td>
                    <td className="mono s13" style={{ color: 'var(--ac)', background: 'var(--sf2)' }}>{c.hash}</td>
                    <td style={{ background: 'var(--sf2)' }}>
                      <div style={{ fontWeight: 500 }}>{c.message}</div>
                      {c.aiNote
                        ? <div className="row s13 muted" style={{ marginTop: 6, gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}><span className="ai-note">AI note</span><span style={{ lineHeight: 1.5 }}>{c.aiNote}</span></div>
                        : <div className="s13 muted" style={{ marginTop: 6 }}>No AI commit notes</div>}
                    </td>
                    <td className="s13" style={{ background: 'var(--sf2)' }}>{c.author}</td>
                    <td className="mono s13" style={{ textAlign: 'right', background: 'var(--sf2)' }}>{c.files}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  });

  return (
    <>
      <div className="sub"><div className="wrap col" style={{ gap: 16 }}>
        <div className="crumb"><Link to="/apps">Apps</Link><span>/</span><Link to={`/apps/${appId}`}>{appName}</Link><span>/</span><span style={{ color: 'var(--tx)' }}>New test cycle</span></div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div className="col" style={{ gap: 6 }}><h1>New test cycle</h1><p className="muted">Choose the pull requests and commits to test. Verity reads their diffs, commit notes and linked work items.</p></div>
          <span className="row s13 muted" style={{ gap: 8 }}><span className="dot" style={{ background: prsLoading ? 'var(--mu)' : 'var(--ps)' }} />{prsLoading ? 'Loading…' : 'Synced with Azure DevOps'}
            <button className="ib" type="button" aria-label="Sync now" onClick={() => refetchPRs()}>{I.refresh}</button></span>
        </div>
        <Stepper st="Draft" />
      </div></div>
      <div className="wrap split">
        <section className="main">
          {genError && (
            <div className="banner b-warn">
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Not imported. Fix these and try again:</p>
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {genError.map((e, i) => <li key={i} className="s13">{e}</li>)}
              </ul>
              {draftCycleId && (
                <div className="row" style={{ marginTop: 10, gap: 10 }}>
                  <button className="btn sec sm" type="button" onClick={handleDiscard}>Discard draft</button>
                </div>
              )}
            </div>
          )}
          <div className="row"><h2 style={{ fontSize: 16 }}>Active pull requests</h2><span className="s13 muted">into {targetBranch} · {apiPRs.length} open</span><div className="sp" />
            <label className="searchbox" style={{ width: 260 }}>{I.search}<input type="search" placeholder="Search PRs or work items" aria-label="Search pull requests" /></label></div>
          {prsLoading && <div className="card pad"><p className="muted s13">Loading pull requests…</p></div>}
          {!prsLoading && apiPRs.length === 0 && (
            <Empty title="No open pull requests">There are no pull requests targeting {targetBranch} right now. Open one in Azure DevOps to start a test cycle.</Empty>
          )}
          {apiCards}
        </section>
        <aside className="side"><div className="card pad col" style={{ gap: 18 }}>
          <h3>Cycle scope</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
            {([[apiPRCount, 'PRs'], [apiCommitCount, 'Commits'], [apiFileCount, 'Files changed']] as const).map(k => (
              <div key={k[1]} style={{ padding: 12, borderRadius: 10, background: 'var(--sf2)' }} className="col">
                <span style={{ fontSize: 22, fontWeight: 600 }}>{k[0]}</span><span className="sm muted" style={{ marginTop: -12 }}>{k[1]}</span>
              </div>
            ))}
          </div>
          <label className="f">Cycle name<input className="input" value={cycleName} placeholder="Untitled cycle" onChange={e => setCycleName(e.target.value)} /></label>
          <div className="col" style={{ gap: 10 }}><span className="s13" style={{ fontWeight: 500 }}>AI will use</span>
            {aiInputLabels.map(([k, label]) =>
              <label key={k} className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={!!aiInputs[k]} disabled readOnly />
                {label}
              </label>
            )}
          </div>
          <button className="btn pri lg" type="button" disabled={!apiCommitCount} onClick={startGen}>{I.spark}{apiCommitCount ? 'Generate Test Cases with AI' : 'Select at least one commit'}</button>
          <p className="sm muted" style={{ lineHeight: 1.5 }}>Generated test cases are drafts. You review and edit every case before assigning a tester.</p>
        </div></aside>
      </div>
    </>
  );
}

function computeDefaultName(prs: { num: number; title: string; inCycle: boolean; commits: unknown[] }[], selPRs: Record<number, boolean>): string {
  const first = prs.find(p => !p.inCycle && selPRs[p.num]);
  return first ? `PR #${first.num} · ${first.title}` : '';
}
