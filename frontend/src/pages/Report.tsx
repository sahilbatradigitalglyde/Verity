import { useStore } from '@/store';
import { FLOW } from '@/data/demo';
import { I } from '@/lib/icons';
import { RS, plural, scoreColor } from '@/lib/util';
import { analyze, modOf } from '@/lib/analyze';
import { PROVIDER_LABEL } from '@/ai/tasks';
import { CycleHead } from '@/components/Shell';
import { AdoLink, Empty, ProvLine } from '@/components/ui';

export function Report() {
  const s = useStore();
  const c = s.cycle;
  if (!c || (FLOW.indexOf(c.status) < 4 && c.status !== 'Changes Requested')) return (
    <>{c && <CycleHead page="report" />}<div className="wrap"><Empty title="No submission yet">The AI validation report appears after the tester submits results.</Empty></div></>
  );
  if (c.status === 'Submitted') {
    const md = s.aiMode.validate;
    if (md !== 'ask') return (
      <><CycleHead page="report" /><div className="wrap"><div className="card empty"><div className="spin" /><h3>AI validation is running in {PROVIDER_LABEL[md]}</h3><p className="muted">Checking coverage, result consistency and evidence for {plural(c.cases.length, 'case')}.</p></div></div></>
    );
    return (
      <><CycleHead page="report" /><div className="wrap"><div className="card empty">
        <span className="aio-i">{I.spark}</span>
        <h3>{c.tester} submitted {plural(c.cases.length, 'result')}. Run the AI validation.</h3>
        <p className="muted" style={{ maxWidth: 520, lineHeight: 1.5 }}>{s.role === 'dev' ? 'Run it with Azure OpenAI or Claude. Both give the same report format, and Verity calculates the readiness score the same way.' : 'Only the senior developer runs the AI validation.'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {s.role !== 'dev'
            ? <button className="btn pri" type="button" onClick={() => s.setRole('dev', '/cycles/482/report')}>Switch to Daniel Okafor</button>
            : <>
                <button className="btn pri" type="button" onClick={() => s.aiRun('validate', 'azure')}>{I.cloud}Run with Azure OpenAI</button>
                <button className="btn" type="button" onClick={() => s.aiRun('validate', 'claude')}>{I.chat}Run with Claude</button>
              </>}
        </div>
      </div></div></>
    );
  }
  const R = analyze(c);
  const canDecide = s.role === 'dev' && c.status === 'AI Reviewed';
  const circ = 402.1, dash = (R.score / 100 * circ).toFixed(1);
  let statusBanner = null;
  if (c.status === 'Approved for UAT') statusBanner = <div className="banner b-ok">{I.check}<span style={{ flex: 1 }}><b>Approved for client UAT</b> by Daniel Okafor at {c.approvedAt}.{c.approvedNote ? ' Note: ' + c.approvedNote : ''} PR #482 now shows the verity/uat-ready check as succeeded in Azure DevOps.</span></div>;
  if (c.status === 'Changes Requested') statusBanner = (
    <div className="banner b-warn"><span style={{ flex: 1 }}><b>Changes requested.</b> Returned to {c.tester}: “{c.changeComment}” This report is from AI run {c.aiRuns}.</span>
      {s.role === 'dev' && <button className="btn sm" type="button" onClick={() => s.setRole('tester', '/cycles/482/run')}>Switch to {c.tester}</button>}</div>);
  if (s.role !== 'dev' && c.status === 'AI Reviewed') statusBanner = (
    <div className="banner b-gray s13">{I.info}<span style={{ flex: 1 }}>Only senior developers can approve or request changes.</span>
      <button className="btn sm" type="button" onClick={() => s.setRole('dev', '/cycles/482/report')}>Switch to Daniel Okafor</button></div>);
  const OpenBtn = ({ id }: { id: string }) => <button className="btn sm" type="button" onClick={() => s.openCase(id)}>Open {id} →</button>;

  return (
    <>
      <CycleHead page="report" />
      <div className="wrap col" style={{ gap: 20 }}>
        {statusBanner}
        <section className="card row" style={{ padding: 28, gap: 32 }}>
          <div className="ring">
            <svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label={`Readiness score ${R.score} out of 100`}>
              <circle cx="74" cy="74" r="64" fill="none" stroke="var(--sf2)" strokeWidth="12" />
              <circle cx="74" cy="74" r="64" fill="none" stroke={scoreColor(R.score)} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${dash} ${circ}`} transform="rotate(-90 74 74)" />
            </svg>
            <div className="c"><span style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{R.score}</span><span className="sm muted" style={{ marginTop: 4 }}>of 100</span></div>
          </div>
          <div className="col" style={{ flex: '1 1 380px', minWidth: 0, gap: 12 }}>
            <span className="sm b muted" style={{ letterSpacing: '.06em', textTransform: 'uppercase' }}>Readiness score · AI run {c.aiRuns}</span>
            {c.ai && <span className="prov"><ProvLine p={c.ai.p} /></span>}
            <h2 style={{ fontSize: 26 }}>{R.verdict}</h2>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>{R.summary}</p>
            <div className="row" style={{ gap: 8 }}>
              {([['pass', 'Pass'], ['fail', 'Fail'], ['blocked', 'Blocked'], ['na', 'N/A']] as const).map(k =>
                <span key={k[0]} className={`pill ${RS[k[0]][1]}`} style={{ height: 28, fontSize: 13 }}><span className="dot" style={{ background: RS[k[0]][2] }} />{R.cnt[k[0]]} {k[1]}</span>)}
            </div>
          </div>
          <div className="col" style={{ flex: '1 1 260px', minWidth: 0, gap: 12 }}>
            {R.parts.map(p => (
              <div key={p[0]} className="col" style={{ gap: 5 }}>
                <div className="row s13" style={{ justifyContent: 'space-between' }}><span>{p[0]}</span><span className="mono">{p[1]}</span></div>
                <div className="bar"><div style={{ width: p[1] + '%', background: scoreColor(p[1]), borderRadius: 999 }} /></div>
              </div>
            ))}
          </div>
          <div className="banner b-gray s13" style={{ flex: '1 1 100%', alignItems: 'flex-start', flexWrap: 'nowrap' }}>{I.info}
            <span className="muted"><b style={{ color: 'var(--tx)' }}>This review is advisory.</b> Verity checks coverage, consistency and evidence against the diff and the test records. It does not re-run tests. The approval decision is yours and is recorded under your name.</span></div>
        </section>
        <div className="split">
          <div className="main" style={{ gap: 20 }}>
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="sec-h"><h3>Coverage</h3><span className="s13 muted">{R.verified} of {R.mods.length} changed areas verified</span></div>
              {R.mods.map(m => (
                <div key={m.id} className="row" style={{ padding: '14px 20px', borderBottom: '1px solid var(--bd)', gap: '12px 20px' }}>
                  <div className="col" style={{ flex: '1 1 220px', minWidth: 0, gap: 3 }}><span className="b">{m.name}</span><span className="sm muted">{m.cases}</span></div>
                  <span className={`risk r-${m.risk}`}>{m.risk} risk</span>
                  <div className="row" style={{ flex: '0 1 190px', gap: 10, flexWrap: 'nowrap' }}>
                    <div className="bar" style={{ flex: 1 }}>{m.total > 0 && <>
                      <div style={{ width: m.p / m.total * 100 + '%', background: 'var(--ps)' }} />
                      <div style={{ width: m.f / m.total * 100 + '%', background: 'var(--fl)' }} />
                      <div style={{ width: m.b / m.total * 100 + '%', background: 'var(--bk)' }} /></>}</div>
                    <span className="mono sm muted">{m.p + m.f}/{m.total} run</span>
                  </div>
                  <span className={`pill ${m.verified ? 'p-pass' : 'p-blk'}`}>{m.verified ? 'Verified' : 'Not verified'}</span>
                </div>
              ))}
            </section>
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="sec-h"><h3>Result consistency</h3><span className={`risk ${R.consistency.length ? 'r-Medium' : 'r-Low'}`}>{R.consistency.length ? plural(R.consistency.length, 'observation') : 'No issues'}</span></div>
              {R.consistency.length ? R.consistency.map(x => (
                <div key={x.id} className="finding">
                  <div className="col" style={{ flex: '1 1 400px', minWidth: 0, gap: 10 }}>
                    <div className="row" style={{ gap: 10 }}><span className="mono s13" style={{ color: 'var(--ac)' }}>{x.id}</span><span className="b">{x.title}</span><span className="pill p-pass">Marked Pass</span></div>
                    <div className="cmp"><div><div className="lbl">Expected</div>{x.exp}</div><div style={{ background: 'var(--bkb)' }}><div className="lbl" style={{ color: 'var(--bk)' }}>Actual (tester)</div>{x.r.actual}</div></div>
                    <p style={{ lineHeight: 1.55 }}><b>Why flagged:</b> {x.why || 'The actual result does not fully support a Pass.'}</p>
                  </div>
                  <OpenBtn id={x.id} />
                </div>
              )) : <p className="s13 muted" style={{ padding: '18px 20px' }}>Every Pass is supported by its actual result.</p>}
            </section>
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="sec-h"><h3>Evidence gaps</h3><span className={`risk ${R.gaps.length ? 'r-Medium' : 'r-Low'}`}>{R.gaps.length ? plural(R.gaps.length, 'observation') : 'No gaps'}</span></div>
              {R.gaps.length ? R.gaps.map(x => (
                <div key={x.id} className="finding" style={{ alignItems: 'center' }}>
                  <div className="col" style={{ flex: '1 1 400px', minWidth: 0, gap: 6 }}>
                    <div className="row" style={{ gap: 10 }}><span className="mono s13" style={{ color: 'var(--ac)' }}>{x.id}</span><span className="b">{x.title}</span><span className="prio P1">P1</span></div>
                    <p className="muted" style={{ lineHeight: 1.55 }}>{x.why || 'Marked Pass with no evidence on a P1 case.'}</p>
                  </div>
                  <OpenBtn id={x.id} />
                </div>
              )) : <p className="s13 muted" style={{ padding: '18px 20px' }}>All high-priority passes have evidence.</p>}
            </section>
            <section className="card" style={{ overflow: 'hidden' }}>
              <div className="sec-h"><h3>Failures and blocked items</h3><span className="s13 muted">{R.issues.length ? plural(R.issues.length, 'item') + ' need your sign-off' : 'None'}</span></div>
              {R.issues.length ? R.issues.map(x => {
                const f = x.r.status === 'fail';
                const st = x.r.status as 'fail' | 'blocked';
                return (
                  <div key={x.id} className="finding">
                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: RS[st][2] }} />
                    <div className="col" style={{ flex: '1 1 400px', minWidth: 0, gap: 8 }}>
                      <div className="row" style={{ gap: 10 }}><span className="mono s13" style={{ color: 'var(--ac)' }}>{x.id}</span><span className="b">{x.title}</span><span className={`pill ${RS[st][1]}`}>{RS[st][0]}</span><span className="sm muted">{x.pri} · {modOf(c, x.mod).name}</span></div>
                      <p className="s13 muted" style={{ lineHeight: 1.5 }}><b style={{ color: 'var(--tx)' }}>Tester:</b> {x.r.actual || 'No actual result entered.'}</p>
                      <p style={{ lineHeight: 1.55 }}><b>AI explanation:</b> {(c.ai && c.ai.explain[x.id]) || (f ? 'The AI did not explain this failure. Check whether the defect is in the change or in the test data before approving.' : 'The AI did not explain this blocked case. The behavior is unverified.')}</p>
                    </div>
                    <div className="col" style={{ gap: 8, alignItems: 'flex-end' }}><OpenBtn id={x.id} />{x.r.bug && <AdoLink className="mono sm">Bug {x.r.bug}</AdoLink>}</div>
                  </div>
                );
              }) : <p className="s13 muted" style={{ padding: '18px 20px' }}>No failed or blocked cases.</p>}
            </section>
          </div>
          <aside className="side">
            {canDecide && <>
              <section className="card pad col" style={{ border: '2px solid var(--acf)', gap: 14 }}><h3>Approve for client UAT</h3>
                <p className="s13 muted" style={{ lineHeight: 1.5 }}>Moves the cycle to Approved for UAT, notifies the client success team and sets the verity/uat-ready check on PR #482 in Azure DevOps.</p>
                <button className="btn pri lg" type="button" onClick={() => s.set(x => { x.modal = { type: 'approve', ok: false }; })}>Approve for Client UAT</button></section>
              <section className="card pad col" style={{ gap: 14 }}><h3>Request changes</h3>
                <p className="s13 muted" style={{ lineHeight: 1.5 }}>Returns the cycle to {c.tester} as In Testing with your comment.</p>
                <button className="btn warn lg" type="button" onClick={() => s.set(x => { x.modal = { type: 'changes' }; })}>Request Changes</button></section>
            </>}
            <section className="card pad col" style={{ gap: 10 }}><h3>AI runs</h3>
              <span className="s13 muted" style={{ lineHeight: 1.5 }}>{plural(c.aiRuns, 'validation run')} on this cycle. Each run is stored with its prompt, reply, provider and who ran it. The score is calculated by Verity from the AI findings, so Azure OpenAI and Claude runs are scored the same way.</span>
              {s.role === 'dev' && c.status === 'AI Reviewed' && <button className="btn sm" type="button" onClick={() => s.aiStart('validate')}>{I.refresh}Re-run AI validation</button>}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
