import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store';
import { I } from '@/lib/icons';
import { isDemo } from '@/config';
import { useApps } from '@/api/hooks';
import type { ApiApp } from '@/types';

export const claimsOpen = (cycle: ReturnType<typeof useStore.getState>['cycle']) =>
  3 + (cycle && cycle.status !== 'Approved for UAT' ? 1 : 0);

function fmtDate(iso: string | null): string {
  if (!iso) return 'Not yet';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return 'Not yet'; }
}

type AppRow = { id: string; name: string; ini: string; path: string; open: number; reg: number; last: string; rate: number | null; tag: { label: string; cls: string } };

function computeApiTag(a: ApiApp): { label: string; cls: string } {
  if (a.awaiting_review > 0) return { label: `${a.awaiting_review} awaiting your review`, cls: 'p-ac' };
  if (a.approved_today > 0) return { label: 'Approved today', cls: 'p-pass' };
  if (a.blocked > 0) return { label: `${a.blocked === 1 ? '1 cycle' : `${a.blocked} cycles`} blocked`, cls: 'p-blk' };
  // Any other open cycle (Draft, Tests Generated, Submitted) still counts as in testing, like the prototype.
  if (a.in_testing > 0 || a.open > 0) return { label: 'In testing', cls: 'p-nr' };
  return { label: 'No open cycles', cls: 'p-nr' };
}

function apiToRow(a: ApiApp): AppRow {
  return {
    id: a.id, name: a.name, ini: a.ini, path: a.path,
    open: a.open, reg: a.reg, last: fmtDate(a.last),
    rate: a.rate_30d ?? null,
    tag: computeApiTag(a),
  };
}

export function Apps() {
  const apps = useStore(s => s.apps);
  const cycle = useStore(s => s.cycle);
  const role = useStore(s => s.role);
  const appFilter = useStore(s => s.appFilter);
  const regTotal = useStore(s => s.regTotal);
  const set = useStore(s => s.set);
  const toast = useStore(s => s.toast);

  const { data: apiApps, error } = useApps();

  useEffect(() => {
    if (!isDemo && error) toast(`Could not load apps: ${(error as Error).message}`);
  }, [error]);

  const list: AppRow[] = isDemo
    ? apps.map(a => {
        let tag = a.tag || { label: '', cls: 'p-nr' }, open = a.open;
        if (a.id === 'claims') {
          open = claimsOpen(cycle);
          tag = cycle && cycle.status === 'AI Reviewed' ? { label: '1 awaiting your review', cls: 'p-ac' }
            : cycle && cycle.status === 'Approved for UAT' ? { label: 'Approved today', cls: 'p-pass' } : { label: 'In testing', cls: 'p-nr' };
        }
        return { ...a, open, tag };
      }).filter(a => appFilter === 'All' || (appFilter === 'Open' ? a.open > 0 : a.tag.cls !== 'p-nr'))
    : (apiApps ?? []).map(apiToRow).filter(a => appFilter === 'All' || (appFilter === 'Open' ? a.open > 0 : a.tag.cls !== 'p-nr'));

  const totalCount = isDemo ? apps.length : (apiApps ?? []).length;
  const admin = role === 'admin';
  return (
    <div className="wrap col" style={{ gap: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="col" style={{ gap: 6 }}><h1>Applications</h1><p className="muted" style={{ fontSize: 15 }}>{totalCount} apps linked to Azure DevOps</p></div>
        {admin
          ? <button className="btn pri" type="button" onClick={() => set(s => { s.modal = { type: 'addapp', org: isDemo ? 'contoso-health' : '', proj: isDemo ? 'Claims' : '', repo: null, name: '', branch: 'main' }; })}>{I.plus}Add App</button>
          : <span className="s13 muted">Admins link new apps. Switch to Sam Patel to try it.</span>}
      </div>
      <div className="row">
        <div className="seg">
          {([['All', 'All apps'], ['Open', 'With open cycles'], ['Attention', 'Needs review or attention']] as const).map(f =>
            <button key={f[0]} type="button" className={appFilter === f[0] ? 'on' : ''} onClick={() => set(s => { s.appFilter = f[0]; })}>{f[1]}</button>)}
        </div>
      </div>
      <div className="grid-apps">
        {list.map(a => (
          <Link key={a.id} className="appcard" to={`/apps/${a.id}`}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <div className="row" style={{ gap: 14, flexWrap: 'nowrap', minWidth: 0 }}>
                <span className="ini">{a.ini}</span>
                <div className="col" style={{ gap: 4, minWidth: 0 }}><span style={{ fontSize: 17, fontWeight: 600 }}>{a.name}</span><span className="mono sm muted ell">{a.path}</span></div>
              </div>
              <span className={`pill ${a.tag.cls}`}>{a.tag.label}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, paddingTop: 16, borderTop: '1px solid var(--bd)' }}>
              <div className="col" style={{ gap: 4 }}><span className="sm muted">Open cycles</span><span style={{ fontSize: 20, fontWeight: 600 }}>{a.open}</span></div>
              <div className="col" style={{ gap: 4 }}><span className="sm muted">Regression suite</span><span style={{ fontSize: 20, fontWeight: 600 }}>{isDemo && a.id === 'claims' ? regTotal : a.reg}</span></div>
              <div className="col" style={{ gap: 4 }}><span className="sm muted">Last approval</span><span style={{ fontSize: 15, fontWeight: 500, paddingTop: 3 }}>{isDemo && a.id === 'claims' && cycle && cycle.status === 'Approved for UAT' ? 'Today' : a.last}</span></div>
            </div>
            {a.rate == null
              ? <span className="s13 muted">No test runs yet</span>
              : <div className="col" style={{ gap: 8 }}>
                  <div className="row s13" style={{ justifyContent: 'space-between' }}><span className="muted">Overall pass rate · last 30 days</span><span className="b" style={{ color: a.rate >= 90 ? 'var(--ps)' : 'var(--bk)' }}>{a.rate}%</span></div>
                  <div className="bar"><div style={{ width: a.rate + '%', background: a.rate >= 90 ? 'var(--ps)' : 'var(--bk)', borderRadius: 999 }} /></div>
                </div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
