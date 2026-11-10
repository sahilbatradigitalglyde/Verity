import { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { I } from '@/lib/icons';
import { AI_TASKS, MODE_LABEL } from '@/ai/tasks';
import { isDemo } from '@/config';
import { useApp, useTesters, useUpdateAppSettings } from '@/api/hooks';
import type { AiMode, AiTask, AppSummary } from '@/types';

const AI_INPUT_LABELS: Record<string, string> = {
  diffs: 'Read code diffs',
  commit_notes: 'Read AI commit notes',
  work_items: 'Read linked work item acceptance criteria',
  regression: 'Suggest related regression tests',
};

export function Settings({ app, appId }: { app?: AppSummary; appId: string }) {
  const role = useStore(s => s.role);
  const aiMode = useStore(s => s.aiMode);
  const { set, toast } = useStore.getState();
  const dis = role !== 'admin';

  // API mode data (disabled in demo)
  const { data: apiApp } = useApp(appId);
  const { data: testersData } = useTesters();
  const updateMutation = useUpdateAppSettings(appId);

  // API mode form state (ignored in demo)
  const [tBranch, setTBranch] = useState('main');
  const [defaultTesterId, setDefaultTesterId] = useState('');
  const [threshold, setThreshold] = useState(75);
  const [aiInputsLocal, setAiInputsLocal] = useState<Record<string, boolean>>({});
  const [aiModesLocal, setAiModesLocal] = useState<Record<string, string>>({});

  // Fill the form once per app. Later refetches (e.g. after a provider autosave) must not wipe unsaved edits.
  const [loadedFor, setLoadedFor] = useState('');
  useEffect(() => {
    if (!isDemo && apiApp && loadedFor !== appId) {
      setLoadedFor(appId);
      setTBranch(apiApp.target_branch);
      setDefaultTesterId(apiApp.default_tester_id ?? '');
      setThreshold(apiApp.approve_threshold);
      setAiInputsLocal({ ...(apiApp.ai_inputs as Record<string, boolean>) });
      setAiModesLocal({ ...(apiApp.ai_modes as Record<string, string>) });
    }
  }, [apiApp, appId, loadedFor]);

  const handleSave = () => {
    if (isDemo) { toast('Settings saved.'); return; }
    updateMutation.mutate(
      { target_branch: tBranch, default_tester_id: defaultTesterId || null, approve_threshold: threshold, ai_modes: aiModesLocal, ai_inputs: aiInputsLocal },
      { onSuccess: () => toast('Settings saved.'), onError: (e) => toast(`Save failed: ${(e as Error).message}`) }
    );
  };

  const pathVal = isDemo ? (app?.path ?? '') : (apiApp?.path ?? '');

  return (
    <div className="split"><div className="main">
      <div className="card pad col">
        <h3>Repository connection</h3>
        {role !== 'admin' && <div className="banner b-gray s13">{I.info}<span>Only admins can change these settings. Switch to Sam Patel to edit.</span></div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          <label className="f">Azure DevOps repository<input className="input mono" value={pathVal} readOnly /></label>
          {isDemo ? (
            <>
              <label className="f">Target branch for cycles<select className="input" disabled={dis}><option>main</option><option>develop</option><option>release/*</option></select></label>
              <label className="f">Default tester<select className="input" disabled={dis}><option>Priya Shah</option><option>Tom&#225;s Rivera</option><option>Jordan Kim</option></select></label>
            </>
          ) : (
            <>
              <label className="f">Target branch for cycles<select className="input" disabled={dis} value={tBranch} onChange={e => setTBranch(e.target.value)}><option value="main">main</option><option value="develop">develop</option><option value="release/*">release/*</option></select></label>
              <label className="f">Default tester<select className="input" disabled={dis} value={defaultTesterId} onChange={e => setDefaultTesterId(e.target.value)}>
                <option value="">None</option>
                {(testersData ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></label>
            </>
          )}
          {isDemo
            ? <label className="f">Readiness score needed to approve<input className="input" type="number" defaultValue={75} min={0} max={100} disabled={dis} /></label>
            : <label className="f">Readiness score needed to approve<input className="input" type="number" value={threshold} min={0} max={100} disabled={dis} onChange={e => setThreshold(Number(e.target.value))} /></label>
          }
        </div>
        <h3 style={{ marginTop: 8 }}>AI inputs</h3>
        {isDemo
          ? ['Read code diffs', 'Read AI commit notes', 'Read linked work item acceptance criteria', 'Suggest related regression tests'].map(x =>
              <label key={x} className="row s13" style={{ gap: 10 }}><input type="checkbox" defaultChecked disabled={dis} />{x}</label>)
          : Object.entries(AI_INPUT_LABELS).map(([k, label]) =>
              <label key={k} className="row s13" style={{ gap: 10 }}><input type="checkbox" checked={!!aiInputsLocal[k]} disabled={dis} onChange={e => { const v = e.target.checked; setAiInputsLocal(prev => ({ ...prev, [k]: v })); }} />{label}</label>)
        }
        <div className="row"><button className="btn pri" type="button" disabled={dis || (!isDemo && updateMutation.isPending)} onClick={handleSave}>Save settings</button></div>
      </div>
      <div className="card pad col" style={{ gap: 14 }}>
        <h3>Gen AI provider for each step</h3>
        <p className="s13 muted" style={{ lineHeight: 1.55 }}>Each AI step runs automatically inside Verity in <b style={{ color: 'var(--tx)' }}>Azure OpenAI</b> or <b style={{ color: 'var(--tx)' }}>Claude</b>. Both use the same prompt and output format, and the reply comes straight back into the cycle. Verity rejects a reply if its run ID or format does not match, and retries once.</p>
        <div className="scroll" style={{ border: '1px solid var(--bd)', borderRadius: 10 }}><table className="t" style={{ minWidth: 640 }}>
          <thead><tr><th>AI step</th><th>Where it runs</th><th>Who</th><th>Provider</th></tr></thead>
          <tbody>
            {(Object.keys(AI_TASKS) as AiTask[]).map(k => {
              const T = AI_TASKS[k];
              return (
                <tr key={k}>
                  <td className="b">{T.name}</td><td className="s13 muted">{T.where}</td><td className="s13">{T.who}</td>
                  <td><select className="input" style={{ height: 34 }} aria-label={`Provider for ${T.name}`} disabled={dis}
                    value={isDemo ? aiMode[k] : (aiModesLocal[k] ?? 'ask')}
                    onChange={e => {
                      const v = e.target.value as AiMode;
                      if (isDemo) { set(s => { s.aiMode[k] = v; }); toast(`${T.name}: ${MODE_LABEL[v]}.`); }
                      else {
                        const newModes = { ...aiModesLocal, [k]: v };
                        setAiModesLocal(newModes);
                        updateMutation.mutate(
                          { ai_modes: newModes },
                          { onSuccess: () => toast(`${T.name}: ${MODE_LABEL[v]}.`), onError: (err) => toast(`Save failed: ${(err as Error).message}`) }
                        );
                      }
                    }}>
                    {(['ask', 'azure', 'claude'] as AiMode[]).map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                  </select></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
          <label className="f">Azure OpenAI deployment<input className="input mono" defaultValue="verity-gpt-4.1 (East US 2)" disabled={dis} /></label>
          <label className="f">Claude model<input className="input mono" defaultValue="Set by CLAUDE_MODEL on the server" disabled={dis} /></label>
        </div>
      </div>
    </div>
    <div className="side"><div className="card pad col" style={{ gap: 12 }}>
      <h3>Integration health</h3>
      {[['Entra ID sign-in', 'Connected'], ['Azure DevOps API (on behalf of user)', 'Connected'], ['Service hook: PR created or updated', 'Receiving · last event 4 min ago'], ['PR status check: verity/uat-ready', 'Posting to PRs'], ['Azure OpenAI', 'Connected'], ['Claude API', 'Connected'], ['Evidence storage', 'Connected']].map(x =>
        <div key={x[0]} className="row s13" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap' }}><span>{x[0]}</span><span className="row" style={{ gap: 6, color: 'var(--ps)', flexWrap: 'nowrap' }}><span className="dot" style={{ background: 'var(--ps)' }} />{x[1]}</span></div>)}
    </div></div></div>
  );
}
