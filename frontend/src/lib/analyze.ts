/**
 * Readiness analysis. Same formula as the prototype and as backend/app/services/scoring.py.
 * In API mode the backend value is authoritative; this copy renders demo mode and previews.
 */
import type { Cycle, Module, TestCase } from '@/types';
import { MODS } from '@/data/demo';
import { plural } from './util';

export const getMods = (c: Cycle | null): Module[] => (c && c.mods ? c.mods : MODS);
export const modOf = (c: Cycle | null, id: string): Module =>
  getMods(c).find(m => m.id === id) || { id, name: id, risk: 'Low', desc: '' };

export type Finding = TestCase & { why: string };
export interface ModCoverage extends Module { cases: string; total: number; p: number; f: number; b: number; verified: boolean }
export interface Analysis {
  cnt: { pass: number; fail: number; blocked: number; na: number; none: number };
  consistency: Finding[]; gaps: Finding[]; issues: TestCase[]; mods: ModCoverage[];
  score: number; verdict: string; summary: string; parts: [string, number][]; obs: number; verified: number;
}

export function analyze(c: Cycle): Analysis {
  const cs = c.cases;
  const cnt = { pass: 0, fail: 0, blocked: 0, na: 0, none: 0 };
  cs.forEach(x => { cnt[x.r.status || 'none']++; });
  const pick = (list: { id: string; why: string }[]) =>
    list.map(f => { const t = cs.find(x => x.id === f.id); return t ? { ...t, why: f.why } : null; }).filter(Boolean) as Finding[];
  const consistency = c.ai ? pick(c.ai.consistency) : [];
  const gaps = c.ai ? pick(c.ai.gaps) : [];
  const issues = cs.filter(x => x.r.status === 'fail' || x.r.status === 'blocked');
  const mods: ModCoverage[] = getMods(c).map(m => {
    const mc = cs.filter(x => x.mod === m.id);
    const p = mc.filter(x => x.r.status === 'pass').length;
    const f = mc.filter(x => x.r.status === 'fail').length;
    const b = mc.filter(x => x.r.status === 'blocked' || x.r.status === 'na').length;
    return { ...m, cases: mc.map(x => x.id).join(', ') || 'No cases', total: mc.length, p, f, b, verified: mc.length > 0 && p + f === mc.length };
  });
  const highUnv = mods.filter(m => m.risk === 'High' && !m.verified).length;
  const obs = consistency.length + gaps.length;
  let score = 100 - 8 * cnt.fail - 6 * cnt.blocked - 2 * obs - 10 * highUnv - 2 * cnt.na;
  score = Math.max(0, Math.min(100, score));
  const p1fail = issues.some(x => x.r.status === 'fail' && x.pri === 'P1');
  const verdict = p1fail ? 'Not ready: a P1 case failed'
    : score >= 80 ? (obs ? `Ready for UAT with ${plural(obs, 'observation')}` : 'Ready for UAT')
    : score >= 65 ? 'Needs attention before UAT' : 'Not ready for UAT';
  const verified = mods.filter(m => m.verified).length;
  const highOk = mods.filter(m => m.risk === 'High').every(m => m.verified);
  let summary = highOk ? 'High-risk refund logic and validation are fully tested.' : 'At least one high-risk area is not fully verified.';
  if (cnt.fail) summary += ` ${plural(cnt.fail, 'case')} failed${issues.some(x => x.r.bug) ? ' with a bug logged' : ''}.`;
  if (cnt.blocked) summary += ` ${plural(cnt.blocked, 'case')} could not run, so ${cnt.blocked === 1 ? 'that area is' : 'those areas are'} unverified.`;
  if (!cnt.fail && !cnt.blocked) summary += ' Every case ran.';
  const p1pass = cs.filter(x => x.r.status === 'pass' && x.pri === 'P1');
  const parts: [string, number][] = [
    ['Coverage of changed areas', Math.round(100 * verified / mods.length)],
    ['Result consistency', Math.max(0, 100 - 14 * consistency.length)],
    ['Evidence on high-priority cases', p1pass.length ? Math.round(100 * p1pass.filter(x => x.r.ev.length).length / p1pass.length) : 100],
    ['Outcomes', Math.round(100 * cnt.pass / cs.length)]
  ];
  return { cnt, consistency, gaps, issues, mods, score, verdict, summary, parts, obs, verified };
}
