import type { ReactNode } from 'react';
import type { Provenance, Source, Status, UserKey } from '@/types';
import { FLOW, USERS } from '@/data/demo';
import { WCLS } from '@/lib/util';
import { I } from '@/lib/icons';
import { PROVIDER_LABEL } from '@/ai/tasks';
import { useStore } from '@/store';

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <h3>{title}</h3>
      <p className="muted" style={{ maxWidth: 460, lineHeight: 1.5 }}>{children}</p>
      {action}
    </div>
  );
}

export const StatusPill = ({ s }: { s: Status }) => <span className={`pill ${WCLS[s]}`}>{s}</span>;

export function SrcBadge({ s }: { s: Source }) {
  switch (s) {
    case 'diff': return <span className="pill p-ac">From diff</span>;
    case 'notes': return <span className="pill p-out">From commit notes</span>;
    case 'reg': return <span className="pill p-nr">From regression suite</span>;
    default: return <span className="pill p-gray">Added manually</span>;
  }
}

export function Avatar({ k, small }: { k: UserKey; small?: boolean }) {
  const u = USERS[k];
  return <span className={`av ${small ? 's' : ''} av-${u.ini}`} aria-hidden="true">{u.ini}</span>;
}

export function Stepper({ st }: { st: Status }) {
  let cur = FLOW.indexOf(st), warn = false;
  if (st === 'Changes Requested') { cur = 3; warn = true; }
  if (st === 'Approved for UAT') cur = 7;
  return (
    <ol className="stepper" aria-label="Cycle workflow">
      {FLOW.map((l, i) => {
        const cls = i < cur ? 'done' : i === cur ? 'cur' + (warn ? ' warn' : '') : '';
        return (
          <li key={l} className={cls} aria-current={i === cur ? 'step' : undefined}>
            <span className="d">{i < cur ? '✓' : warn && i === cur ? '!' : i + 1}</span>
            {warn && i === cur ? 'Changes Requested' : l}
            {i < FLOW.length - 1 && <span className="ln" />}
          </li>
        );
      })}
    </ol>
  );
}

/** "Azure OpenAI · run VR-482-GEN-001 · 4:32 PM" provenance line under every AI output. */
export function ProvLine({ p }: { p: Provenance | null | undefined }) {
  if (!p) return null;
  return (
    <>{p.prov === 'azure' ? I.cloud : I.chat}{PROVIDER_LABEL[p.prov]} · run <span className="mono">{p.runId}</span> · {p.at}</>
  );
}

export const AdoLink = ({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) => {
  return (
    <a href="#" className={className} style={style}
      onClick={e => { e.preventDefault(); useStore.getState().toast('In the real app this opens the item in Azure DevOps.'); }}>{children}</a>
  );
};

/** Sample rows that are not wired up in demo mode. */
export const sampleRowToast = () => useStore.getState().toast('Sample row. In this prototype only PR #482 on Claims Portal is wired up.');
