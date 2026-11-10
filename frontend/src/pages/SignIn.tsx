import { useState } from 'react';
import { useStore } from '@/store';
import { FLOW, USERS } from '@/data/demo';
import { I, MicrosoftLogo } from '@/lib/icons';
import { config, isDemo } from '@/config';
import { signInWithMicrosoft } from '@/auth/msal';
import { setDevUser } from '@/api/client';
import type { RoleKey } from '@/types';

export function SignIn() {
  const role = useStore(s => s.role);
  const theme = useStore(s => s.theme);
  const { signIn, toggleTheme } = useStore.getState();
  const [demoRole, setDemoRole] = useState<RoleKey>(role);
  // Demo mode always signs in locally; Microsoft redirect only in api mode with a client id.
  const hasEntra = !isDemo && !!config.entra.clientId;
  const showPicker = isDemo || !hasEntra;
  const handleSignIn = () => {
    if (hasEntra) { signInWithMicrosoft(); return; }
    setDevUser(demoRole);
    signIn(demoRole);
  };
  return (
    <div className="signin">
      <div className="l">
        <div className="row" style={{ gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: '#fff', color: '#3730A3', display: 'grid', placeItems: 'center' }}>{I.check}</span>
          <span style={{ fontSize: 22, fontWeight: 600 }}>Verity</span>
        </div>
        <div className="col" style={{ gap: 20, maxWidth: 520 }}>
          <h1 style={{ fontSize: 44, lineHeight: 1.12, color: '#fff' }}>From pull request to client UAT, with evidence at every step.</h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: '#D9DBFF' }}>Verity reads your Azure DevOps pull requests, drafts test cases from the diff, routes them to testers and checks the results before anything reaches your client.</p>
        </div>
        <div className="col" style={{ gap: 12 }}>
          <span className="sm b" style={{ letterSpacing: '.08em', textTransform: 'uppercase', color: '#C7C9FF' }}>Every cycle follows the same path</span>
          <div className="row" style={{ gap: 8 }}>
            {FLOW.map(s => <span key={s} style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.22)', fontSize: 13, fontWeight: 500 }}>{s}</span>)}
          </div>
        </div>
      </div>
      <div className="r">
        <div className="card" style={{ width: '100%', maxWidth: 420, padding: 36, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div className="col" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 26 }}>Sign in to Verity</h2>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.55 }}>Use your work account. Verity signs you in through Microsoft Entra ID.</p>
          </div>
          <button className="ms" type="button" onClick={handleSignIn}><MicrosoftLogo />Sign in with Microsoft</button>
          <div className="banner b-ac" style={{ alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--ac)' }}>{I.shield}</span>
            <p className="s13" style={{ flex: 1 }}>Access mirrors your Azure DevOps permissions. You only see the organizations, projects and repositories you can already open in Azure DevOps.</p>
          </div>
          {showPicker && (
            <label className="f">{isDemo ? 'Prototype only: sign in as' : 'Sign in as'}
              <select className="input" value={demoRole} onChange={e => setDemoRole(e.target.value as RoleKey)}>
                {(['dev', 'tester', 'admin'] as RoleKey[]).map(k => <option key={k} value={k}>{USERS[k].name} · {USERS[k].role}</option>)}
              </select>
            </label>
          )}
          <div className="row s13 muted" style={{ justifyContent: 'space-between' }}>
            <span>Trouble signing in? <a href="#" onClick={e => e.preventDefault()}>Contact your Verity admin</a></span>
            <button className="ib" type="button" onClick={toggleTheme} aria-label="Toggle dark mode">{theme === 'dark' ? I.sun : I.moon}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
