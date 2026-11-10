import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { FLOW } from '@/data/demo';
import { I } from '@/lib/icons';
import { plural } from '@/lib/util';
import { Avatar, Empty, StatusPill, sampleRowToast } from '@/components/ui';
import type { Status } from '@/types';

interface QRow { tab: 'Open' | 'Submitted' | 'Completed'; app: string; pr: string; title: string; status: Status; done: number; total: number; due: string; note?: string; live?: boolean; cta: string }

export function Queue() {
  const s = useStore();
  const navigate = useNavigate();
  const rows: QRow[] = [];
  const c = s.cycle;
  if (c && (FLOW.indexOf(c.status) >= 2 || c.status === 'Changes Requested')) {
    const done = c.cases.filter(x => x.r.status).length;
    const tab = ['Assigned', 'In Testing', 'Changes Requested'].includes(c.status) ? 'Open' : c.status === 'Approved for UAT' ? 'Completed' : 'Submitted';
    rows.push({ tab, app: 'Claims Portal', pr: 'PR #482', title: 'Add partial refund support to claim settlement', status: c.status, done, total: c.cases.length, due: c.dueLabel,
      note: c.status === 'Changes Requested' ? c.changeComment : '', live: true,
      cta: c.status === 'Assigned' ? 'Start testing' : c.status === 'In Testing' ? 'Continue testing' : c.status === 'Changes Requested' ? 'Resume' : 'View' });
  }
  rows.push({ tab: 'Open', app: 'Claims Portal', pr: 'Release 2026.10.2', title: 'October release candidate 2', status: 'Changes Requested', done: 31, total: 38, due: 'Today', note: 'TC-22 says Pass but the actual result mentions a timeout. Re-run it and attach the API log.', cta: 'Resume' });
  rows.push({ tab: 'Open', app: 'Member Mobile API', pr: 'PR #311', title: 'Push notification opt-out per category', status: 'Assigned', done: 0, total: 9, due: 'Nov 5', cta: 'Start testing' });
  rows.push({ tab: 'Open', app: 'Billing Service', pr: 'PR #904', title: 'Invoice PDF: add remittance footer', status: 'Assigned', done: 0, total: 6, due: 'Nov 6', cta: 'Start testing' });
  rows.push({ tab: 'Submitted', app: 'Adjuster Workbench', pr: 'PR #233', title: 'Bulk reassign claims between adjusters', status: 'Submitted', done: 7, total: 7, due: 'Oct 29', cta: 'View' });
  rows.push({ tab: 'Completed', app: 'Claims Portal', pr: 'PR #468', title: 'Claims export: CSV format v2', status: 'Approved for UAT', done: 12, total: 12, due: 'Oct 21', cta: 'View' });
  const shown = rows.filter(r => r.tab === s.queueTab);
  const openCount = rows.filter(r => r.tab === 'Open').length;
  const left = rows.filter(r => r.tab === 'Open').reduce((n, r) => n + r.total - r.done, 0);

  if (s.role !== 'tester') return <div className="wrap"><Empty title="This is the tester’s queue" action={<button className="btn pri" type="button" onClick={() => s.setRole('tester', '/queue')}>Switch to Priya Shah</button>}>Switch to Priya Shah to see assigned cycles.</Empty></div>;
  return (
    <div className="wrap col" style={{ gap: 22, maxWidth: 1200 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="col" style={{ gap: 6 }}><h1>My testing queue</h1><p className="muted" style={{ fontSize: 15 }}>{plural(openCount, 'open cycle')} · {plural(left, 'test case')} left</p></div>
        <div className="seg">{(['Open', 'Submitted', 'Completed'] as const).map(t =>
          <button key={t} type="button" className={s.queueTab === t ? 'on' : ''} onClick={() => s.set(x => { x.queueTab = t; })}>{t} ({rows.filter(r => r.tab === t).length})</button>)}</div>
      </div>
      {(!c || c.status === 'Tests Generated') && <div className="banner b-gray s13">{I.info}<span>PR #482 will appear here once Daniel Okafor assigns it to you.</span></div>}
      {shown.length ? shown.map((q, i) => (
        <a key={i} className="card row" href={q.live ? '/cycles/482/run' : '#'}
          onClick={e => { e.preventDefault(); if (q.live) navigate('/cycles/482/run'); else sampleRowToast(); }}
          style={{ padding: '20px 24px', gap: 20, textDecoration: 'none', color: 'var(--tx)', ...(q.live ? { borderColor: 'var(--acf)' } : {}) }}>
          <div className="col" style={{ flex: '1 1 420px', minWidth: 0, gap: 8 }}>
            <div className="row" style={{ gap: 10 }}><span className="s13 muted" style={{ fontWeight: 500 }}>{q.app}</span><span className="mono s13" style={{ color: 'var(--ac)' }}>{q.pr}</span><StatusPill s={q.status} /></div>
            <span style={{ fontSize: 17, fontWeight: 600 }}>{q.title}</span>
            {q.note && <div className="row s13" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'nowrap', padding: '10px 12px', borderRadius: 8, background: 'var(--bkb)', lineHeight: 1.5 }}><Avatar k="dev" small /><span><b>Daniel Okafor requested changes:</b> {q.note}</span></div>}
          </div>
          <div className="col" style={{ flex: '0 1 220px', gap: 8 }}>
            <div className="row s13" style={{ justifyContent: 'space-between' }}><span className="muted">Progress</span><span className="mono">{q.done}/{q.total}</span></div>
            <div className="bar"><div style={{ width: q.done / q.total * 100 + '%', background: 'var(--acf)' }} /></div>
          </div>
          <div className="col" style={{ flex: '0 0 100px', gap: 4 }}><span className="sm muted">Due</span><span className="b" style={{ color: q.due === 'Today' ? 'var(--fl)' : 'var(--tx)' }}>{q.due}</span></div>
          <span className={`btn ${q.live ? 'pri' : ''}`}>{q.cta}</span>
        </a>
      )) : <Empty title="Nothing here">No cycles in this list.</Empty>}
    </div>
  );
}
