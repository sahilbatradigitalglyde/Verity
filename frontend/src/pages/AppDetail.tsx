import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '@/store';
import { FLOW, STATIC_CYCLES } from '@/data/demo';
import { I } from '@/lib/icons';
import { analyze } from '@/lib/analyze';
import { AdoLink, Empty, StatusPill, sampleRowToast } from '@/components/ui';
import { claimsOpen } from './Apps';
import { Settings } from './Settings';
import { RegressionTable } from './Regression';
import { isDemo } from '@/config';
import { useApp, useAppCycles, useTesters } from '@/api/hooks';
import type { ApiCycleRow, RoleKey, Status } from '@/types';

type DemoRow = { title: string; sub: string; status: Status; pr: string; author: string; tester: string; pass: number; fail: number; blocked: number; total: number; score: number | null; updated: string; to: string | null };

const CYCLE_STATUSES: Status[] = ['Draft', 'Tests Generated', 'Assigned', 'In Testing', 'Submitted', 'AI Reviewed', 'Approved for UAT', 'Changes Requested'];

function cycleNav(status: string, role: RoleKey, id: string): string {
  if (role === 'tester') return `/cycles/${id}/run`;
  if (['Submitted', 'AI Reviewed', 'Approved for UAT'].includes(status)) return `/cycles/${id}/report`;
  if (['Assigned', 'In Testing', 'Changes Requested'].includes(status)) return `/cycles/${id}/run`;
  return `/cycles/${id}/review`;
}

function fmtUpdated(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Not yet';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return 'Not yet'; }
}

export function AppDetail({ tab }: { tab: 'cycles' | 'regression' | 'settings' }) {
  const { appId = 'claims' } = useParams();
  const apps = useStore(s => s.apps);
  const cycle = useStore(s => s.cycle);
  const role = useStore(s => s.role);
  const regTotal = useStore(s => s.regTotal);
  const toast = useStore(s => s.toast);
  const navigate = useNavigate();

  // API data (disabled in demo)
  const { data: apiApp, error: appError } = useApp(appId);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [testerFilter, setTesterFilter] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data: cyclesData, error: cyclesError } = useAppCycles(appId, {
    q: debouncedQ || undefined, status: statusFilter || undefined, tester: testerFilter || undefined, page,
  });
  const { data: testersData } = useTesters();

  useEffect(() => {
    if (!isDemo && appError) toast(`Could not load app: ${(appError as Error).message}`);
  }, [appError]);
  useEffect(() => {
    if (!isDemo && cyclesError) toast(`Could not load cycles: ${(cyclesError as Error).message}`);
  }, [cyclesError]);
  useEffect(() => { setPage(1); }, [debouncedQ, statusFilter, testerFilter]);

  // Demo store data
  const demoApp = apps.find(x => x.id === appId) || apps[0];
  const isClaims = isDemo && demoApp?.id === 'claims';
  const canNew = role === 'dev' && (isDemo ? isClaims : !!apiApp);

  // Header values
  const appName = isDemo ? demoApp.name : (apiApp?.name ?? '…');
  const appIni = isDemo ? demoApp.ini : (apiApp?.ini ?? '…');
  const appPath = isDemo ? demoApp.path : (apiApp?.path ?? '');
  const appOpen = isDemo ? (isClaims ? claimsOpen(cycle) : demoApp.open) : (apiApp?.open ?? 0);
  const appReg = isDemo ? (isClaims ? regTotal : demoApp.reg) : (apiApp?.reg ?? 0);
  const appRate = isDemo ? demoApp.rate : (apiApp?.rate_30d ?? null);
  const appLast = isDemo
    ? (isClaims && cycle?.status === 'Approved for UAT' ? 'Today' : demoApp.last.replace(', 2026', ''))
    : fmtDate(apiApp?.last ?? null);

  const cycleTabCount: number | null = isDemo
    ? (isClaims ? (cycle ? 6 : 5) : null)
    : (cyclesData?.total ?? null);

  let body;
  if (tab === 'regression') {
    body = isClaims
      ? <RegressionTable />
      : <Empty title="No regression cases yet">Promote test cases from approved cycles to start this app’s regression suite.</Empty>;
  } else if (tab === 'settings') {
    body = <Settings app={isDemo ? demoApp : undefined} appId={appId} />;
  } else if (isDemo && !isClaims) {
    body = <Empty title="No test cycles yet" action={<Link className="btn" to="/apps/claims">Open Claims Portal</Link>}>In this prototype only Claims Portal has pull requests wired up. Open Claims Portal to walk through a cycle.</Empty>;
  } else if (isDemo) {
    // Demo Claims cycle table — unchanged from prototype
    const rows: DemoRow[] = [];
    if (cycle) {
      const cs = cycle.cases;
      const p = cs.filter(x => x.r.status === 'pass').length, f = cs.filter(x => x.r.status === 'fail').length, b = cs.filter(x => x.r.status === 'blocked' || x.r.status === 'na').length;
      const idx = FLOW.indexOf(cycle.status);
      const sc = idx >= 5 ? analyze(cycle).score : null;
      const target = role === 'dev' ? (idx >= 4 ? 'report' : idx >= 2 || cycle.status === 'Changes Requested' ? 'run' : 'review') : 'run';
      rows.push({ title: 'Add partial refund support to claim settlement', sub: `6 commits · ${cs.length} test cases`, status: cycle.status, pr: 'PR #482', author: 'Marcus Lee', tester: cycle.tester || 'Unassigned', pass: p, fail: f, blocked: b, total: cs.length, score: sc, updated: 'Just now', to: '/cycles/482/' + target });
    }
    STATIC_CYCLES.forEach(r => rows.push({ ...r, to: null }));
    body = (
      <>
        <div className="row">
          <label className="searchbox" style={{ width: 280 }}>{I.search}<input type="search" placeholder="Filter by PR, title or person" aria-label="Filter cycles" /></label>
          <button className="btn sm" type="button" onClick={sampleRowToast}>Status: Open</button>
          <button className="btn sm" type="button" onClick={sampleRowToast}>Tester: Anyone</button>
        </div>
        <div className="card scroll"><table className="t" style={{ minWidth: 1080 }}>
          <thead><tr><th>Cycle</th><th>Status</th><th>PR</th><th>Author</th><th>Tester</th><th style={{ width: 170 }}>Progress</th><th>AI readiness</th><th>Updated</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const done = r.pass + r.fail + r.blocked, sc = r.score;
              const col = sc == null ? 'var(--mu)' : sc >= 80 ? 'var(--ps)' : sc >= 65 ? 'var(--bk)' : 'var(--fl)';
              return (
                <tr key={i} className="click" onClick={() => (r.to ? navigate(r.to) : sampleRowToast())}>
                  <td><span className="b">{r.title}</span><div className="sm muted" style={{ marginTop: 3 }}>{r.sub}</div></td>
                  <td><StatusPill s={r.status} /></td>
                  <td className="mono s13" style={{ color: 'var(--ac)' }}>{r.pr}</td>
                  <td>{r.author}</td>
                  <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span className="av s av-x">{r.tester === 'Unassigned' ? '?' : r.tester.split(' ').map(x => x[0]).join('')}</span>{r.tester}</span></td>
                  <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                    <div className="bar" style={{ flex: 1 }}>
                      <div style={{ width: r.pass / r.total * 100 + '%', background: 'var(--ps)' }} />
                      <div style={{ width: r.fail / r.total * 100 + '%', background: 'var(--fl)' }} />
                      <div style={{ width: r.blocked / r.total * 100 + '%', background: 'var(--bk)' }} />
                    </div>
                    <span className="mono sm muted">{done}/{r.total}</span>
                  </div></td>
                  <td className="s13 b" style={{ color: col }}>{sc == null ? 'Not run' : sc + ' / 100'}</td>
                  <td className="s13 muted">{r.updated}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </>
    );
  } else {
    // API mode cycle table
    const items: ApiCycleRow[] = cyclesData?.items ?? [];
    body = (
      <>
        <div className="row">
          <label className="searchbox" style={{ width: 280 }}>{I.search}<input type="search" placeholder="Filter by PR, title or person" aria-label="Filter cycles" value={q} onChange={e => setQ(e.target.value)} /></label>
          <select className="btn sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Status: All</option>
            {CYCLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="btn sm" value={testerFilter} onChange={e => setTesterFilter(e.target.value)}>
            <option value="">Tester: Anyone</option>
            {(testersData ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="card scroll"><table className="t" style={{ minWidth: 1080 }}>
          <thead><tr><th>Cycle</th><th>Status</th><th>PR</th><th>Author</th><th>Tester</th><th style={{ width: 170 }}>Progress</th><th>AI readiness</th><th>Updated</th></tr></thead>
          <tbody>
            {items.map(r => {
              const p = r.progress, done = p.pass + p.fail + p.blocked + p.na, total = r.case_count || 1;
              const sc = r.score;
              const col = sc == null ? 'var(--mu)' : sc >= 80 ? 'var(--ps)' : sc >= 65 ? 'var(--bk)' : 'var(--fl)';
              const prLabel = r.kind === 'release' || r.pr_numbers.length > 1 ? 'Release' : `PR #${r.pr_number}`;
              const sub = r.kind === 'release' ? `${r.pr_numbers.length} PRs · ${r.case_count} test cases` : `${r.commit_count} commits · ${r.case_count} test cases`;
              const testerName = r.tester?.name ?? 'Unassigned';
              const testerIni = r.tester?.initials ?? '?';
              const authors = Array.isArray(r.authors) && r.authors.length ? r.authors.join(', ') : '—';
              return (
                <tr key={r.id} className="click" onClick={() => navigate(cycleNav(r.status, role, r.id))}>
                  <td><span className="b">{r.name}</span><div className="sm muted" style={{ marginTop: 3 }}>{sub}</div></td>
                  <td><StatusPill s={r.status as Status} /></td>
                  <td className="mono s13" style={{ color: 'var(--ac)' }}>{prLabel}</td>
                  <td>{authors}</td>
                  <td><span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><span className="av s av-x">{testerIni}</span>{testerName}</span></td>
                  <td><div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                    <div className="bar" style={{ flex: 1 }}>
                      <div style={{ width: (p.pass / total * 100) + '%', background: 'var(--ps)' }} />
                      <div style={{ width: (p.fail / total * 100) + '%', background: 'var(--fl)' }} />
                      <div style={{ width: ((p.blocked + p.na) / total * 100) + '%', background: 'var(--bk)' }} />
                    </div>
                    <span className="mono sm muted">{done}/{r.case_count}</span>
                  </div></td>
                  <td className="s13 b" style={{ color: col }}>{sc == null ? 'Not run' : sc + ' / 100'}</td>
                  <td className="s13 muted">{fmtUpdated(r.updated_at)}</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={8} className="muted s13" style={{ textAlign: 'center', padding: 24 }}>No cycles yet.</td></tr>
            )}
          </tbody>
        </table></div>
        {cyclesData && cyclesData.pages > 1 && (
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn sm" type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&#8592; Prev</button>
            <span className="s13 muted">Page {cyclesData.page} of {cyclesData.pages}</span>
            <button className="btn sm" type="button" disabled={page >= cyclesData.pages} onClick={() => setPage(p => p + 1)}>Next &#8594;</button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="sub"><div className="wrap col" style={{ gap: 18, paddingBottom: 0 }}>
        <div className="crumb"><Link to="/apps">Apps</Link><span>/</span><span style={{ color: 'var(--tx)' }}>{appName}</span></div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
            <span className="ini" style={{ width: 52, height: 52, fontSize: 18 }}>{appIni}</span>
            <div className="col" style={{ gap: 6 }}><h1>{appName}</h1><AdoLink className="mono s13 row" style={{ gap: 6, textDecoration: 'none' }}>{appPath} {I.ext}</AdoLink></div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" type="button" onClick={() => toast('Regression run queued. In the real app this creates a cycle from the selected regression cases.')}>Run regression suite</button>
            {canNew && <Link className="btn pri" to={`/apps/${appId}/cycles/new`}>{I.plus}New test cycle</Link>}
          </div>
        </div>
        <div className="kpis">
          <div className="kpi"><span className="sm muted">Open cycles</span><b>{appOpen}</b></div>
          <div className="kpi"><span className="sm muted">Regression suite</span><b>{appReg} cases</b></div>
          <div className="kpi"><span className="sm muted">Pass rate · 30 days</span><b style={{ color: 'var(--ps)' }}>{appRate == null ? '—' : appRate + '%'}</b></div>
          <div className="kpi"><span className="sm muted">Last approval for UAT</span><b>{appLast}</b></div>
        </div>
        <nav className="tabs" aria-label="App sections">
          <Link to={`/apps/${appId}`} className={tab === 'cycles' ? 'on' : ''}>Test Cycles{cycleTabCount != null && <span className="cnt">{cycleTabCount}</span>}</Link>
          <Link to={`/apps/${appId}/regression`} className={tab === 'regression' ? 'on' : ''}>Regression Suite</Link>
          <Link to={`/apps/${appId}/settings`} className={tab === 'settings' ? 'on' : ''}>Settings</Link>
        </nav>
      </div></div>
      <div className="wrap col">{body}</div>
    </>
  );
}
