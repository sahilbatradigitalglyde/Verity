import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import { FILES, SUGG } from '@/data/demo';
import { I } from '@/lib/icons';
import { plural } from '@/lib/util';
import { getMods } from '@/lib/analyze';
import { CycleHead } from '@/components/Shell';
import { Empty, ProvLine, SrcBadge } from '@/components/ui';

export function Review() {
  const s = useStore();
  const c = s.cycle;
  const [tester, setTester] = useState('Priya Shah');
  const [due, setDue] = useState('2026-11-03');
  if (!c) return <div className="wrap"><Empty title="No cycle yet" action={<Link className="btn pri" to="/apps/claims/cycles/new">New test cycle</Link>}>Start a new test cycle from PR #482 first.</Empty></div>;
  const editable = c.status === 'Tests Generated' && s.role === 'dev';
  const dis = !editable;
  const counts: Record<string, number> = {};
  c.cases.forEach(t => { counts[t.mod] = (counts[t.mod] || 0) + 1; });
  const edited = c.cases.filter(t => t.edited).length;
  let banner = null;
  if (!editable && s.role !== 'dev') banner = <div className="banner b-gray s13">{I.info}<span>Test cases are curated by the senior developer.</span></div>;
  else if (!editable) banner = (
    <div className="banner b-ac s13">{I.info}<span style={{ flex: 1 }}>Assigned to <b>{c.tester}</b>, due {c.dueLabel}. Cases are locked while the cycle is with the tester.</span>
      <button className="btn sm" type="button" onClick={() => s.setRole('tester', '/cycles/482/run')}>Switch to {c.tester}’s view</button></div>
  );
  const suggList = SUGG.filter(x => !c.suggest || c.suggest.includes(x.reg));
  const riskN = (r: string) => getMods(c).filter(m => m.risk === r).length;

  return (
    <>
      <CycleHead page="review" />
      <div className="wrap split">
        <aside className="side">
          <section className="card pad col" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 8 }}><span style={{ color: 'var(--ac)' }}>{I.spark}</span><h3 style={{ fontSize: 15 }}>AI change summary</h3></div>
            <p style={{ lineHeight: 1.6 }}>{c.summary}</p>
            <div className="row" style={{ gap: 8 }}><span className="risk r-High">{riskN('High')} high risk</span><span className="risk r-Medium">{riskN('Medium')} medium</span><span className="risk r-Low">{riskN('Low')} low</span></div>
            <span className="prov"><ProvLine p={c.genAi} /></span>
          </section>
          <section className="card" style={{ overflow: 'hidden' }}>
            <h3 style={{ fontSize: 15, padding: '16px 20px', borderBottom: '1px solid var(--bd)' }}>Changes by module</h3>
            {getMods(c).map(m => (
              <div key={m.id} className="col" style={{ gap: 6, padding: '14px 20px', borderBottom: '1px solid var(--bd)' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="b">{m.name}</span><span className={`risk r-${m.risk}`}>{m.risk} risk</span></div>
                <p className="s13 muted" style={{ lineHeight: 1.5 }}>{m.desc}</p>
                <span className="sm muted">{plural(counts[m.id] || 0, 'test case')} cover this</span>
              </div>
            ))}
            <details>
              <summary className="row b" style={{ padding: '14px 20px', justifyContent: 'space-between', cursor: 'pointer' }}>Files changed ({FILES.length}){I.chev}</summary>
              <div style={{ padding: '0 12px 12px' }}>
                {FILES.map(f => (
                  <div key={f.path} className="row" style={{ gap: 8, padding: '6px 8px', flexWrap: 'nowrap' }}>
                    <span className="dot" style={{ borderRadius: 2, background: f.status === 'A' ? 'var(--ps)' : 'var(--bk)' }} title={f.status === 'A' ? 'Added' : 'Modified'} />
                    <span className="mono sm ell" style={{ flex: 1 }}>{f.path}</span>
                    <span className="mono sm" style={{ color: 'var(--ps)' }}>+{f.added}</span><span className="mono sm" style={{ color: 'var(--fl)' }}>−{f.removed}</span>
                  </div>
                ))}
              </div>
            </details>
          </section>
        </aside>
        <section className="main">
          {banner}
          <div className="row"><h2>Test cases</h2><span className="s13 muted">{c.cases.length} drafted{edited ? ' · ' + edited + ' edited by you' : ''}</span><div className="sp" />
            <button className="btn sm" type="button" disabled={dis} onClick={() => s.set(x => { x.modal = { type: 'case', id: null }; })}>{I.plus}Add test case manually</button>
            <button className="btn sm" type="button" disabled={dis} onClick={() => s.aiStart('regen')}>{I.refresh}Regenerate</button>
            <button className={`btn sm ${s.suggestionsOn ? 'on' : ''}`} type="button" aria-pressed={s.suggestionsOn} onClick={() => s.set(x => { x.suggestionsOn = !x.suggestionsOn; })}>{I.list}Include related regression tests</button>
          </div>
          {s.suggestionsOn && (
            <div className="card" style={{ borderColor: 'var(--acf)', overflow: 'hidden' }}>
              <div className="row" style={{ padding: '12px 16px', background: 'var(--acs)' }}>
                <span className="b" style={{ color: 'var(--ac)' }}>{plural(suggList.length, 'related regression test')} suggested</span>
                <span className="s13 muted">from {s.regTotal} in the Claims Portal suite</span><div className="sp" />
                <button className="btn pri sm" type="button" disabled={dis} onClick={s.addAllSugg}>Add all</button>
              </div>
              {suggList.map(x => (
                <div key={x.reg} className="row" style={{ padding: '12px 16px', borderTop: '1px solid var(--bd)' }}>
                  <span className="mono sm muted" style={{ width: 64 }}>{x.reg}</span>
                  <div className="col" style={{ flex: '1 1 360px', minWidth: 0, gap: 3 }}><span style={{ fontWeight: 500 }}>{x.title}</span><span className="s13 muted"><b style={{ color: 'var(--tx)' }}>Match reason:</b> {x.reason}</span></div>
                  <span className="sm muted">Last run {x.last}</span>
                  {s.suggAdded[x.reg]
                    ? <span className="pill p-pass">{I.check}Added as {s.suggAdded[x.reg]}</span>
                    : <button className="btn sm" type="button" disabled={dis} onClick={() => s.addSugg(x.reg)}>Add to cycle</button>}
                </div>
              ))}
            </div>
          )}
          <div className="card scroll"><div style={{ minWidth: 940 }}>
            <div className="chead"><span>ID</span><span>Title</span><span>Type</span><span>Priority</span><span>Linked file / module</span><span>Source</span><span style={{ textAlign: 'right' }}>Actions</span></div>
            {c.cases.map(t => (
              <div key={t.id} className={`case ${t.edited ? 'ed' : ''}`}>
                <div className="case-top">
                  <span className="mono sm muted">{t.id}</span>
                  <span className="b row" style={{ gap: 8 }}>{t.title}{t.edited && <span className="tag ed">Edited</span>}{t.promoted && <span className="tag ok">In regression</span>}</span>
                  <span className="tag" style={{ justifySelf: 'start' }}>{t.type}</span>
                  <span className={`prio ${t.pri}`}>{t.pri}</span>
                  <span className="mono sm muted ell">{t.file}</span>
                  <span><SrcBadge s={t.src} /></span>
                  <div className="row" style={{ gap: 2, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <button className="ib" type="button" aria-label={`Edit ${t.id}`} title="Edit" disabled={dis} onClick={() => s.set(x => { x.modal = { type: 'case', id: t.id }; })}>{I.edit}</button>
                    <button className="ib" type="button" aria-label={`Duplicate ${t.id}`} title="Duplicate" disabled={dis} onClick={() => s.dupCase(t.id)}>{I.dup}</button>
                    <button className="ib" type="button" aria-label={`Promote ${t.id} to regression`} title="Promote to regression" disabled={t.promoted || s.role !== 'dev'} onClick={() => s.promoteCase(t.id)}>{I.promote}</button>
                    <button className="ib" type="button" aria-label={`Delete ${t.id}`} title="Delete" disabled={dis} onClick={() => s.delCase(t.id)}>{I.trash}</button>
                  </div>
                </div>
                <div className="case-bot"><span />
                  <div><div className="lbl">Preconditions</div>{t.pre}</div>
                  <div><div className="lbl">Steps</div><ol>{t.steps.map((st, i) => <li key={i}>{st}</li>)}</ol></div>
                  <div><div className="lbl">Expected result</div>{t.exp}</div>
                </div>
              </div>
            ))}
          </div></div>
          {editable && (
            <div className="card pad row" style={{ alignItems: 'flex-end', gap: 16 }}>
              <label className="f" style={{ flex: '1 1 260px' }}>Assign to tester<select className="input" value={tester} onChange={e => setTester(e.target.value)}><option>Priya Shah</option><option>Tomás Rivera</option><option>Jordan Kim</option></select></label>
              <label className="f" style={{ flex: '0 1 200px' }}>Due date<input className="input" type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
              <button className="btn pri" type="button" disabled={!c.cases.length} onClick={() => s.assign(tester, due)}>Assign {plural(c.cases.length, 'case')}</button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
