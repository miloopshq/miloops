import path from 'node:path';
import type { TrackerAdapter } from '../adapters/adapter';
import { BRAND } from '../model/brand';
import type { Journal, TicketPhase } from '../model/lifecycle';
import type { MapSnapshot, Ticket } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { resolve, type DecisionMeta } from '../planning/operations/resolve';
import { DEFAULT_CONFIG } from './config';
import { readVerificationConfig, type ConfigRead } from './configFile';
import { evidencePaths, nextAttemptId, readAttempts, writeAttempt } from './evidenceStore';
import { attemptComment, outcomeOf } from './outcome';
import { verificationFor, type LevelInfo } from './policy';
import { runChecks } from './runChecks';
import { acquireRunLock, releaseRunLock } from './runLock';

/** The engine as an actor: comments and journal lines of the check runner. */
export const CHECK_RUNNER = BRAND.slug;

export interface VerifyEnv {
  adapter: TrackerAdapter;
  /** Tracker folder: `verification.json`, `.evidence/`, `.agents/runs/`. */
  root: string;
  /** Checks run here; defaults to the folder that holds the tracker folder. */
  repoRoot?: string;
  journal?: Journal;
  signal?: AbortSignal;
}

/** What the agent claimed, kept on the attempt and used to resolve the ticket when it passes. */
export interface Submission {
  agent: string;
  sessionId?: string;
  resolution: string;
  summary?: string;
  rationale?: string;
  alternatives?: string[];
  /** In-process only: the decision record's audit fields and the HITL transcript to post. */
  decision?: DecisionMeta;
  transcript?: string;
}

export interface Settled {
  attempt: VerificationAttempt;
  phase: TicketPhase;
  /** Failed attempts so far, this one included. */
  failures: number;
  maxAttempts: number;
}

/** The level a completion of `t` needs, with the config it was read from. */
export function levelFor(root: string, snap: MapSnapshot, t: Ticket): { info: LevelInfo; config: ConfigRead } {
  const config = readVerificationConfig(root);
  return { info: verificationFor(config.config, snap.map, t), config };
}

/**
 * Runs the checks for a ticket that is verifying, writes the attempt and moves
 * the ticket on (done, rework, blocked, or still verifying for review). The
 * attempt id is taken under the ticket's run lock, so only one run per ticket
 * happens at a time across processes.
 */
export async function verify(
  env: VerifyEnv,
  mapId: string,
  t: Ticket,
  info: LevelInfo,
  sub: Submission,
): Promise<{ attemptId: string; done: Promise<Settled> }> {
  const config = readVerificationConfig(env.root);
  const base = {
    v: 1 as const,
    mapId,
    ticketId: t.id,
    ticketKey: t.key,
    agent: sub.agent,
    ...(sub.sessionId ? { sessionId: sub.sessionId } : {}),
    level: info.level,
    configHash: config.hash ?? 'none',
    submittedAt: Date.now(),
    resolution: sub.resolution,
    ...(sub.summary ? { summary: sub.summary } : {}),
    ...(sub.rationale ? { rationale: sub.rationale } : {}),
    ...(sub.alternatives?.length ? { alternatives: sub.alternatives } : {}),
  };
  const id = nextAttemptId(env.root, mapId, t.id);
  const lock = acquireRunLock(env.root, { ...base, id });
  if (!lock.ok)
    throw new OperationError(`${t.key} is already being verified (${lock.holder.id}, pid ${lock.holder.pid})`);
  if (lock.recovered) {
    // the dead run took the id we picked: start over with the next one
    releaseRunLock(env.root, mapId, t.id);
    return verify(env, mapId, t, info, sub);
  }
  const done = (async (): Promise<Settled> => {
    let attempt: VerificationAttempt;
    try {
      const repoRoot = env.repoRoot ?? path.dirname(env.root);
      const rel = evidencePaths.logs(mapId, t.id, id);
      const outcome = config.config
        ? await runChecks(config.config, info.checks, {
            repoRoot,
            logDir: path.join(env.root, rel),
            logRel: rel,
            signal: env.signal,
          })
        : {
            checks: [],
            result: 'error' as const,
            note: config.exists
              ? `verification.json has errors: ${config.errors.join('; ')}`
              : 'verification.json is missing, so the checks this ticket needs cannot run',
          };
      attempt = { ...base, id, finishedAt: Date.now(), ...outcome };
      writeAttempt(env.root, attempt);
    } finally {
      releaseRunLock(env.root, mapId, t.id);
    }
    return settle(env, attempt, sub, (config.config ?? DEFAULT_CONFIG).maxAttempts);
  })();
  return { attemptId: id, done };
}

async function settle(env: VerifyEnv, a: VerificationAttempt, sub: Submission, maxAttempts: number): Promise<Settled> {
  const failures = readAttempts(env.root, a.mapId, a.ticketId).filter((x) => x.result === 'fail').length;
  const o = outcomeOf(a, failures, maxAttempts);
  const engine = { actor: CHECK_RUNNER, actorKind: 'engine' as const, reason: o.reason, sessionId: sub.sessionId };
  await env.adapter.comment(a.mapId, a.ticketId, CHECK_RUNNER, attemptComment(a, o));
  if (o.to === 'done') {
    const d = sub.decision ?? {};
    await resolve(
      env.adapter,
      a.mapId,
      a.ticketId,
      {
        answer: a.resolution,
        summary: a.summary,
        author: a.agent,
        transcript: sub.transcript,
        decision: { ...d, rationale: a.rationale ?? d.rationale, alternatives: a.alternatives ?? d.alternatives },
      },
      { ...engine, event: 'checks.pass', journal: env.journal },
    );
  } else
    await transition(
      env.adapter,
      a.mapId,
      a.ticketId,
      { ...engine, event: o.event, to: o.to, expect: 'verifying' },
      { journal: env.journal },
    );
  return { attempt: a, phase: o.to, failures, maxAttempts };
}

/** Starts a fresh attempt for a run whose process died, from the submission its lock kept. */
export async function rerun(env: VerifyEnv, snap: MapSnapshot, interrupted: VerificationAttempt) {
  const t = snap.tickets.find((x) => x.id === interrupted.ticketId);
  if (!t || t.state !== 'open' || t.status !== 'verifying') return undefined;
  const { info } = levelFor(env.root, snap, t);
  return verify(env, snap.map.id, t, info, {
    agent: interrupted.agent,
    sessionId: interrupted.sessionId,
    resolution: interrupted.resolution,
    summary: interrupted.summary,
    rationale: interrupted.rationale,
    alternatives: interrupted.alternatives,
  });
}
