import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useStore, home } from '@/store';
import { USERS } from '@/data/demo';
import { I } from '@/lib/icons';
import { Avatar, AdoLink, Stepper, StatusPill } from './ui';
import { config, isDemo } from '@/config';
import { setDevUser } from '@/api/client';
import type { RoleKey } from '@/types';

export function Shell({ children }: { children: ReactNode }) {
  const role = useStore(s => s.role);
  const theme = useStore(s => s.theme);
  const { toggleTheme, setRole } = useStore.getState();
  const r = useLocation().pathname.replace(/^\//, '');
  const navs: [string, string][] = role === 'tester' ? [['My queue', 'queue']] : [['Apps', 'apps'], ['Regression', 'apps/claims/regression']];
  const u = USERS[role];
  const isOn = (to: string) => r === to || (to === 'apps' && ((r.startsWith('apps/') && !r.endsWith('regression') && !r.endsWith('settings')) || r.startsWith('cycles/')));
  return (
    <>
      <header className="hdr">
        <Link className="logo" to={home(role)}><i>{I.check}</i>Verity</Link>
        <nav className="nav" aria-label="Main">
          {navs.map(n => <Link key={n[1]} to={'/' + n[1]} className={isOn(n[1]) ? 'on' : ''}>{n[0]}</Link>)}
        </nav>
        <div className="sp" />
        {(isDemo || !config.entra.clientId) && (
          <label className="row s13 muted" style={{ gap: 8 }}>Viewing as
            <select className="input" aria-label="Switch role" style={{ height: 34 }} value={role}
              onChange={e => { const r = e.target.value as RoleKey; if (!isDemo) setDevUser(r); setRole(r); }}>
              {(['dev', 'tester', 'admin'] as RoleKey[]).map(k => <option key={k} value={k}>{USERS[k].name} · {USERS[k].role}</option>)}
            </select>
          </label>
        )}
        <button className="ib" type="button" onClick={toggleTheme} aria-label="Toggle dark mode">{theme === 'dark' ? I.sun : I.moon}</button>
        <div className="who"><Avatar k={role} /><div className="n"><span className="s13 b">{u.name}</span><span className="sm muted">{u.role}</span></div></div>
      </header>
      {children}
    </>
  );
}

export type CyclePage = 'review' | 'run' | 'report';

export function CycleHead({ page }: { page: CyclePage }) {
  const { cycleId = '482' } = useParams();
  const c = useStore(s => s.cycle);
  const role = useStore(s => s.role);
  const openAudit = useStore(s => s.openAudit);
  const st = c ? c.status : 'Draft';
  const links: [CyclePage, string][] = role === 'tester' ? [] : [['review', 'Test cases'], ['run', 'Execution'], ['report', 'AI report']];
  return (
    <div className="sub"><div className="wrap col" style={{ gap: 14 }}>
      <div className="crumb">
        {role === 'tester'
          ? <><Link to="/queue">My queue</Link><span>/</span><span>Claims Portal</span><span>/</span><span style={{ color: 'var(--tx)' }}>PR #482</span></>
          : <><Link to="/apps">Apps</Link><span>/</span><Link to="/apps/claims">Claims Portal</Link><span>/</span><span style={{ color: 'var(--tx)' }}>PR #482</span></>}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div className="col" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 12 }}><h1 style={{ fontSize: 23 }}>Add partial refund support to claim settlement</h1><StatusPill s={st} /></div>
          <div className="row s13 muted" style={{ gap: '6px 16px' }}>
            <AdoLink className="mono" style={{ textDecoration: 'none' }}>PR #482</AdoLink>
            <span>Marcus Lee, Anika Rao</span>
            <span className="mono sm">feature/partial-refunds → main</span>
            <span>6 commits · 19 files</span>
            {c && c.tester && <span>Tester: {c.tester} · due {c.dueLabel}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          {links.length > 0 && (
            <div className="seg" role="tablist">
              {links.map(l => <Link key={l[0]} role="tab" to={`/cycles/${cycleId}/${l[0]}`} className={page === l[0] ? 'on' : ''} aria-selected={page === l[0]}>{l[1]}</Link>)}
            </div>
          )}
          <button className="btn sm" type="button" onClick={openAudit}>{I.clock}Audit trail</button>
        </div>
      </div>
      <Stepper st={st} />
    </div></div>
  );
}
