import { useStore } from '@/store';
import { I } from '@/lib/icons';
import { plural } from '@/lib/util';
import { ProvLine } from '@/components/ui';
import type { RegressionCase } from '@/types';

export function useRegRows() {
  const regression = useStore(s => s.regression);
  const regQ = useStore(s => s.regQ), regMod = useStore(s => s.regMod), regRes = useStore(s => s.regRes);
  const q = regQ.trim().toLowerCase();
  return regression.filter(r => (!q || (r.id + ' ' + r.title + ' ' + r.tags.join(' ')).toLowerCase().includes(q)) && (regMod === 'All' || r.mod === regMod) && (regRes === 'All' || r.res === regRes));
}

const RES_CLS: Record<RegressionCase['res'], string> = { Pass: 'p-pass', Fail: 'p-fail', Blocked: 'p-blk', 'Not run': 'p-nr' };
const HIST_C: Record<string, string> = { P: 'var(--ps)', F: 'var(--fl)', B: 'var(--bk)', N: 'var(--bd2)' };

export function RegressionTable() {
  const rows = useRegRows();
  const s = useStore();
  const { set } = s;
  const selN = Object.keys(s.regSel).filter(k => s.regSel[k]).length;
  const dups = s.regression.filter(r => r.dup && s.regression.some(x => x.id === r.dup));
  const pairs: [string, string][] = [];
  dups.forEach(r => { if (!pairs.some(p => p.includes(r.id))) pairs.push([r.id, r.dup]); });
  const mods = ['All', ...new Set(s.regression.map(r => r.mod))];
  const exportRows = () => { const sel = s.regression.filter(r => s.regSel[r.id]); s.exportRegression(sel.length ? sel : rows); };
  return (
    <>
      {pairs.length > 0 && (
        <div className="banner b-warn"><span style={{ color: 'var(--bk)' }}>{I.copy}</span>
          <span style={{ flex: '1 1 400px' }}><b>AI found {plural(pairs.length, 'likely duplicate pair')}.</b> {pairs.map(p => `${p[0]} and ${p[1]}`).join('; ')} test the same behavior.
            {s.dupRun && <><br /><span className="prov"><ProvLine p={s.dupRun} /></span></>}</span>
        </div>
      )}
      <div className="row">
        <label className="searchbox" style={{ width: 300 }}>{I.search}<input type="search" placeholder="Search regression cases or tags" aria-label="Search regression cases" value={s.regQ} onChange={e => { const v = e.target.value; set(x => { x.regQ = v; }); }} /></label>
        <label className="row s13" style={{ gap: 6 }}>Module<select className="input" style={{ height: 36 }} value={s.regMod} onChange={e => { const v = e.target.value; set(x => { x.regMod = v; }); }}>{mods.map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="row s13" style={{ gap: 6 }}>Last result<select className="input" style={{ height: 36 }} value={s.regRes} onChange={e => { const v = e.target.value; set(x => { x.regRes = v; }); }}>{['All', 'Pass', 'Fail', 'Blocked', 'Not run'].map(m => <option key={m}>{m}</option>)}</select></label>
        <div className="sp" />
        {s.role !== 'tester' && <button className="btn sm" type="button" onClick={() => s.aiStart('dups')}>{I.spark}Scan for duplicates</button>}
        <button className="btn sm" type="button" onClick={exportRows}>Export {selN ? 'selected' : 'all'}</button>
      </div>
      {selN > 0 && (
        <div className="row" style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--acf)', color: '#fff' }}>
          <span className="b">{selN} selected</span><div className="sp" />
          {(['Tag', 'Archive', 'Export'] as const).map(a => (
            <button key={a} type="button" className="btn sm" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.45)' }}
              onClick={() => (a === 'Tag' ? set(x => { x.modal = { type: 'tag' }; }) : a === 'Archive' ? s.archiveSelected() : exportRows())}>{a}</button>
          ))}
          <button type="button" className="btn sm" style={{ background: 'transparent', color: '#fff', border: 0 }} onClick={() => set(x => { x.regSel = {}; })}>Clear</button>
        </div>
      )}
      <div className="card scroll"><table className="t" style={{ minWidth: 1160 }}>
        <thead><tr>
          <th style={{ width: 28 }}><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && rows.every(r => s.regSel[r.id])}
            onChange={e => { const on = e.target.checked; set(x => { rows.forEach(r => { x.regSel[r.id] = on; }); }); }} /></th>
          <th>ID</th><th>Title</th><th>Module and tags</th><th>Priority</th><th>Last run</th><th>Last result</th><th>Last 10 runs</th><th>Source cycle</th>
        </tr></thead>
        <tbody>
          {rows.length ? rows.map(r => {
            const dupOk = r.dup && s.regression.some(x => x.id === r.dup);
            return (
              <tr key={r.id} className={s.regSel[r.id] ? 'sel' : ''}>
                <td><input type="checkbox" checked={!!s.regSel[r.id]} aria-label={`Select ${r.id}`} onChange={e => { const on = e.target.checked; set(x => { x.regSel[r.id] = on; }); }} /></td>
                <td className="mono sm muted">{r.id}</td>
                <td><span style={{ fontWeight: 500 }}>{r.title}</span>
                  {dupOk && <div className="row sm b" style={{ gap: 6, marginTop: 4, color: 'var(--bk)' }}>{I.copy}Possible duplicate of {r.dup}
                    <button type="button" className="btn sm" style={{ height: 24, padding: '0 8px', fontSize: 12 }} onClick={() => set(x => { x.modal = { type: 'merge', id: r.id }; })}>Merge</button></div>}
                </td>
                <td><span className="row" style={{ gap: 6 }}><span className="tag f">{r.mod}</span>{r.tags.map(t => <span key={t} className="tag" style={{ borderColor: 'var(--acf)', color: 'var(--ac)' }}>#{t}</span>)}</span></td>
                <td><span className={`prio ${r.pri}`}>{r.pri}</span></td>
                <td className="s13 muted">{r.last}</td>
                <td><span className={`pill ${RES_CLS[r.res]}`}>{r.res}</span></td>
                <td><span role="img" aria-label="Last 10 runs" style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end', height: 18 }}>
                  {r.hist.split('').map((h, i) => <span key={i} style={{ width: 6, borderRadius: 2, height: h === 'P' ? 18 : h === 'N' ? 6 : 12, background: HIST_C[h] }} />)}
                </span></td>
                <td className="mono sm" style={{ color: 'var(--ac)' }}>{r.src}</td>
              </tr>
            );
          }) : <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 32 }}>No cases match these filters.</td></tr>}
        </tbody>
      </table>
        <div className="row s13 muted" style={{ justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--bd)' }}><span>Showing {rows.length} of {s.regTotal} cases (prototype loads a sample)</span></div>
      </div>
    </>
  );
}
