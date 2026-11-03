import type { VerificationLevel } from '../model/lifecycle';
import type { TicketType } from '../model/types';
import type { CheckResult } from '../model/verification';

/**
 * Acceptance criteria: what "done" means for a ticket, agreed before the work starts. Each criterion needs evidence
 * when the work is completed: a passing check from verification.json, a named test or command, the pull request,
 * or the operator's sign-off (`manual`). Stored per mission in `<tracker dir>/criteria/<mapId>.md`.
 */
export type CriterionKind = 'unit' | 'integration' | 'e2e' | 'regression' | 'business-rule' | 'security' | 'manual';
export const CRITERION_KINDS: CriterionKind[] = [
  'unit',
  'integration',
  'e2e',
  'regression',
  'business-rule',
  'security',
  'manual',
];

export interface Criterion {
  /** `AC-<n>`, per ticket. */
  id: string;
  text: string;
  kind: CriterionKind;
  /** The knowledge entry it comes from, e.g. `K-3` for a business rule. */
  source?: string;
}

export interface TicketCriteria {
  ticketId: string;
  ticketKey: string;
  criteria: Criterion[];
  /** The operator confirmed these criteria; cleared whenever they change. */
  confirmed?: boolean;
}

/** Evidence an agent gives for one criterion: `check:<name>`, `test:<name>`, `command:<cmd>`, `pr`, or `manual`. */
export interface CriterionEvidence {
  id: string;
  evidence: string;
  note?: string;
}

export interface CriteriaResult {
  /** One line per criterion, as the ticket comment shows it. */
  lines: string[];
  /** Criteria with no evidence given. */
  missing: string[];
  /** Criteria whose evidence is a check that failed or didn't run. */
  failed: string[];
  /** Criteria the operator must sign off. */
  manual: string[];
  evidence: CriterionEvidence[];
}

export const CRITERIA_DIR = 'criteria';
export const isCriterionKind = (v: unknown): v is CriterionKind => CRITERION_KINDS.includes(v as CriterionKind);

/** Implementation tickets on missions with a discovery brief need criteria before they can be completed. */
export const IMPLEMENTATION_TYPES: TicketType[] = ['task', 'execute', 'prototype'];
export function criteriaRequired(hasBrief: boolean, type: TicketType, level: VerificationLevel) {
  return hasBrief && level !== 'off' && IMPLEMENTATION_TYPES.includes(type);
}

/** Numbers new criteria after the existing ones: `AC-1`, `AC-2`, … */
export function numbered(items: Omit<Criterion, 'id'>[]): Criterion[] {
  return items.map((c, i) => ({
    id: `AC-${i + 1}`,
    text: c.text.trim(),
    kind: c.kind,
    ...(c.source ? { source: c.source } : {}),
  }));
}

const passed = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/**
 * Matches the agent's evidence to the criteria. Deterministic: a criterion with no evidence is missing; a `check:`
 * that didn't run or didn't pass fails it; `manual` waits for the operator; named tests, commands and the PR count as
 * the agent states them (the checks still have to pass overall).
 */
export function checkCriteria(
  criteria: Criterion[],
  given: CriterionEvidence[],
  checks: CheckResult[],
): CriteriaResult {
  const byId = new Map(given.map((e) => [e.id, e]));
  const out: CriteriaResult = { lines: [], missing: [], failed: [], manual: [], evidence: [] };
  for (const c of criteria) {
    const e = byId.get(c.id);
    if (!e || !e.evidence.trim()) {
      out.missing.push(c.id);
      out.lines.push(`${c.id} ✗ no evidence · ${c.text}`);
      continue;
    }
    out.evidence.push(e);
    const ev = e.evidence.trim();
    if (ev.startsWith('check:')) {
      const name = ev.slice(6);
      const run = checks.find((x) => x.name === name);
      if (!run || !passed(run)) {
        out.failed.push(c.id);
        out.lines.push(`${c.id} ✗ ${ev} ${run ? 'failed' : "didn't run"} · ${c.text}`);
        continue;
      }
    }
    if (ev === 'manual') {
      out.manual.push(c.id);
      out.lines.push(`${c.id} … needs your sign-off · ${c.text}`);
      continue;
    }
    out.lines.push(`${c.id} ✓ ${ev}${e.note ? ` (${e.note})` : ''} · ${c.text}`);
  }
  return out;
}

/** Business rules that apply to the ticket (by knowledge id) but no criterion covers yet. */
export function uncoveredRules(criteria: Criterion[], ruleIds: string[]) {
  const covered = new Set(criteria.map((c) => c.source).filter(Boolean));
  return ruleIds.filter((id) => !covered.has(id));
}
