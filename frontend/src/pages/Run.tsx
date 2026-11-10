import { useStore } from '@/store';
import { I } from '@/lib/icons';
import { RS, isLocked, plural } from '@/lib/util';
import { CycleHead } from '@/components/Shell';
import { Avatar, Empty } from '@/components/ui';
import { isDemo } from '@/config';

export function Run() {
  const s = useStore();
  const c = s.cycle;
  if (!c || c.status === 'Tests Generated') return (
    <>
      {c && <CycleHead page="run" />}
      <div className="wrap"><Empty title="Not assigned yet"
        action={s.role === 'tester' ? <button className="btn" type="button" onClick={() => s.setRole('dev', c ? '/cycles/482/review' : '/apps/claims/cycles/new')}>Switch to Daniel Okafor</button> : undefined}>
        This cycle reaches the tester after the senior developer reviews the test cases and assigns them.</Empty></div>
    </>
  );
  const lock = isLocked(c.status);
  const canEdit = s.role === 'tester' && !lock;
  const dis = !canEdit;
  const idx = s.runIdx >= c.cases.length ? 0 : s.runIdx;
  const t = c.cases[idx];
  const chk = t.steps.map((_, j) => !!t.r.chk[j]);
  const cnt = { pass: 0, fail: 0, blocked: 0, na: 0 }; let done = 0;
  c.cases.forEach(x => { if (x.r.status) { done++; cnt[x.r.status]++; } });
  const ready = done === c.cases.length;
  const upd = (fn: (r: typeof t.r) => void) => s.set(x => { fn(x.cycle!.cases[idx].r); });

  let banner = null;
  if (s.role !== 'tester') banner = (
    <div className="banner b-gray s13">{I.info}<span style={{ flex: 1 }}>You are viewing {c.tester}’s results. Only the assigned tester can record results.</span>
      {!lock && <button className="btn sm" type="button" onClick={() => s.setRole('tester', '/cycles/482/run')}>Switch to {c.tester}</button>}</div>);
  else if (c.status === 'Changes Requested') banner = (
    <div className="banner b-warn s13" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><Avatar k="dev" small /><span><b>Daniel Okafor requested changes:</b> {c.changeComment}</span></div>);
  else if (lock) banner = (
    <div className={`banner ${c.status === 'Approved for UAT' ? 'b-ok' : 'b-ac'} s13`}>{I.info}
      <span style={{ flex: 1 }}>{c.status === 'Submitted' ? 'Submitted for review. Verity is running AI validation.' : c.status === 'AI Reviewed' ? 'Submitted. Waiting for Daniel Okafor to approve or request changes.' : 'Approved for client UAT. Results are read-only.'}</span>
      {c.status !== 'Submitted' && <button className="btn sm" type="button" onClick={() => s.setRole('dev', '/cycles/482/report')}>Switch to Daniel Okafor</button>}</div>);
  else if (c.status === 'Assigned') banner = (
    <div className="banner b-ac s13">{I.info}<span style={{ flex: 1 }}>Recording your first result moves the cycle to In Testing.{isDemo ? ' In this prototype you can also fill all cases with sample results.' : ''}</span></div>);

  return (
    <>
      <CycleHead page="run" />
      <div className="sub" style={{ background: 'var(--sf2)' }}><div className="wrap row" style={{ paddingTop: 14, paddingBottom: 14, gap: '16px 24px' }}>
        <div className="col" style={{ flex: '1 1 380px', gap: 8 }}>
          <div className="row s13" style={{ justifyContent: 'space-between' }}><span className="b">{done} of {c.cases.length} recorded</span>
            <span className="row muted" style={{ gap: 12 }}><span style={{ color: 'var(--ps)' }}>{cnt.pass} pass</span><span style={{ color: 'var(--fl)' }}>{cnt.fail} fail</span><span style={{ color: 'var(--bk)' }}>{cnt.blocked} blocked</span><span>{cnt.na} N/A</span></span></div>
          <div className="segbar" role="img" aria-label="Progress by test case" style={{ gridTemplateColumns: `repeat(${c.cases.length},minmax(0,1fr))` }}>
            {c.cases.map((x, i) => <span key={x.id} style={{ background: x.r.status ? RS[x.r.status][2] : i === idx ? 'var(--acf)' : 'var(--bd2)' }} />)}
          </div>
        </div>
        {isDemo && canEdit && !ready && <button className="btn sm" type="button" onClick={s.fillSample}>Prototype: fill sample results</button>}
        {s.role === 'tester' && !lock && (
          <div className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
            <button className="btn pri" type="button" disabled={!ready} onClick={s.submit}>Submit for Review</button>
            {!ready && <span className="sm muted">{plural(c.cases.length - done, 'case')} still need a status</span>}
          </div>
        )}
      </div></div>
      <div className="wrap col">
        {banner}
        <div className="split">
          <nav className="side card navlist" aria-label="Test cases" style={{ overflow: 'hidden', gap: 0, flexBasis: 300 }}>
            <div className="b" style={{ padding: '14px 16px' }}>Test cases</div>
            {c.cases.map((x, i) => (
              <button key={x.id} type="button" className={i === idx ? 'on' : ''} aria-current={i === idx ? 'true' : undefined} onClick={() => s.set(y => { y.runIdx = i; })}>
                <span className="dot" style={{ width: 10, height: 10, ...(x.r.status ? { background: RS[x.r.status][2] } : { border: '2px solid var(--bd2)' }) }} />
                <span className="col" style={{ flex: 1, minWidth: 0, gap: 2 }}><span className="mono" style={{ fontSize: 11, color: 'var(--mu)' }}>{x.id} · {x.pri}</span><span className="s13" style={{ fontWeight: 500, lineHeight: 1.35 }}>{x.title}</span></span>
                <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: x.r.status ? RS[x.r.status][2] : 'var(--mu)' }}>{x.r.status ? (x.r.status === 'na' ? 'N/A' : RS[x.r.status][0]) : 'Not run'}</span>
              </button>
            ))}
          </nav>
          <section className="main">
            <div className="card pad col" style={{ padding: 24, gap: 20 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="col" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 8 }}><span className="mono s13 muted">{t.id}</span><span className="tag">{t.type}</span><span className={`prio ${t.pri}`}>{t.pri}</span><span className="mono sm muted">{t.file}</span></div>
                  <h2 style={{ fontSize: 22 }}>{t.title}</h2>
                </div>
                <span className="s13 muted">Case {idx + 1} of {c.cases.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--sf2)' }}><div className="lbl">Preconditions</div><span style={{ lineHeight: 1.5 }}>{t.pre}</span></div>
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--acs)' }}><div className="lbl" style={{ color: 'var(--ac)' }}>Expected result</div><span style={{ lineHeight: 1.5 }}>{t.exp}</span></div>
              </div>
              <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <legend className="b" style={{ marginBottom: 8 }}>Steps <span className="muted" style={{ fontWeight: 400 }}>· {chk.filter(Boolean).length} of {t.steps.length} checked</span></legend>
                {t.steps.map((st, j) => (
                  <label key={j} className={`stepchk ${chk[j] ? 'on' : ''}`}>
                    <input type="checkbox" checked={chk[j]} disabled={dis} onChange={e => { const on = e.target.checked; upd(r => { r.chk = t.steps.map((_, k) => (k === j ? on : !!r.chk[k])); }); }} />
                    <span className="mono sm muted" style={{ width: 16 }}>{j + 1}</span><span style={{ flex: 1 }}>{st}</span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="card pad col" style={{ padding: 24, gap: 20 }}>
              <h3>Record result</h3>
              <label className="f">Actual result<textarea className="input" rows={3} placeholder="Describe what actually happened" disabled={dis} value={t.r.actual} onChange={e => { const v = e.target.value; upd(r => { r.actual = v; }); }} /></label>
              <div className="col" style={{ gap: 8 }}><span className="s13" style={{ fontWeight: 500 }}>Status</span>
                <div role="radiogroup" aria-label="Status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
                  {(['pass', 'fail', 'blocked', 'na'] as const).map(k => {
                    const on = t.r.status === k;
                    return (
                      <button key={k} type="button" role="radio" aria-checked={on} className="stbtn" disabled={dis} onClick={() => s.setStatus(k)}
                        style={on ? { background: RS[k][3], color: RS[k][2], border: `2px solid ${RS[k][2]}` } : undefined}>
                        <span className="dot" style={{ width: 10, height: 10, background: RS[k][2] }} />{RS[k][0]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
                <label className="f">Notes<textarea className="input" rows={3} placeholder="Anything the reviewer should know" disabled={dis} value={t.r.notes} onChange={e => { const v = e.target.value; upd(r => { r.notes = v; }); }} /></label>
                <div className="col" style={{ gap: 6 }}>
                  <label htmlFor="f-bug" className="s13" style={{ fontWeight: 500 }}>Defect link</label>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <input id="f-bug" className="input" style={{ flex: 1 }} placeholder="Azure DevOps bug ID, e.g. AB#1318" disabled={dis} value={t.r.bug} onChange={e => { const v = e.target.value; upd(r => { r.bug = v; }); }} />
                    <button className="btn" type="button" disabled={dis} onClick={() => s.aiStart('bug')}>{I.plus}Create bug</button>
                  </div>
                  <span className="sm muted">Create bug opens a prefilled Azure DevOps bug with steps and evidence.</span>
                </div>
              </div>
              <div className="col" style={{ gap: 8 }}><span className="s13" style={{ fontWeight: 500 }}>Evidence</span>
                {canEdit && (
                  <label className="drop"><span style={{ color: 'var(--ac)' }}>{I.upload}</span><span><span className="b" style={{ color: 'var(--ac)' }}>Upload files</span> or drag them here</span>
                    <span className="sm muted">Screenshots, logs or screen recordings · up to 200 MB each</span>
                    <input type="file" multiple style={{ display: 'none' }} onChange={e => { const names = Array.from(e.target.files || []).map(f => f.name); upd(r => { r.ev.push(...names); }); e.target.value = ''; }} />
                  </label>
                )}
                {t.r.ev.length ? t.r.ev.map((ev, k) => (
                  <div key={k} className="file"><span className="ft">{ev.split('.').pop()!.toUpperCase().slice(0, 4)}</span>
                    <span className="col" style={{ flex: 1, minWidth: 0, gap: 2 }}><span className="mono s13 ell">{ev}</span><span className="sm muted">Stored in evidence storage</span></span>
                    {canEdit && <button className="ib" type="button" aria-label={`Remove ${ev}`} onClick={() => upd(r => { r.ev.splice(k, 1); })}>{I.close}</button>}
                  </div>
                )) : (!canEdit && <span className="s13 muted">No evidence attached</span>)}
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn" type="button" disabled={idx === 0} onClick={() => s.set(x => { x.runIdx = Math.max(0, idx - 1); })}>← Previous case</button>
              <button className="btn pri" type="button" disabled={idx === c.cases.length - 1} onClick={() => s.set(x => { x.runIdx = Math.min(c.cases.length - 1, idx + 1); })}>{canEdit ? 'Save and next' : 'Next case'} →</button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
