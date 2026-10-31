import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { MarkdownFs } from '../adapters/markdown/markdownFs';
import { DECISION_PATH } from '../adapters/markdown/paths';
import { isOutboxPath } from '../adapters/remote/outboxFile';
import { readAgentDoc } from '../agents/agentDocs';
import { SESSION_DOC_PATH, agentPaths, isAgentPath } from '../agents/agentLink';
import { JOURNAL_DIR } from '../history/journalFile';
import { parseDecision } from '../planning/decisions/decisionFile';
import type { DecisionEvent } from './bridgeTypes';

/**
 * Turns changes in the tracker folder into SSE messages for `send`: `{ path }`
 * per changed file, named `decision` events for decision records and named
 * `agent` events for agent session docs. Returns the function that stops watching.
 */
export function watchTrackerFolder(abs: string, fs: MarkdownFs, send: (text: string) => void): () => void {
  const seen = new Map<string, { text: string; supersededBy?: string }>();

  async function onDecisionFile(rel: string) {
    let text: string;
    try {
      text = await fs.read(rel);
    } catch {
      return;
    }
    const prev = seen.get(rel);
    if (prev?.text === text) return;
    const decision = { ...parseDecision(text), mapId: rel.split('/')[0] };
    seen.set(rel, { text, supersededBy: decision.supersededBy });
    const kind: DecisionEvent['kind'] = !prev
      ? 'decision.recorded'
      : decision.supersededBy && !prev.supersededBy
        ? 'decision.superseded'
        : 'decision.updated';
    const ev: DecisionEvent = { kind, mapId: decision.mapId, decision };
    send(`event: decision\ndata: ${JSON.stringify(ev)}\n\n`);
  }

  void fs.list().then(async (files) => {
    for (const f of files.filter((x) => DECISION_PATH.test(x))) {
      const text = await fs.read(f).catch(() => '');
      seen.set(f, { text, supersededBy: text ? parseDecision(text).supersededBy : undefined });
    }
  });

  const sentDocs = new Map<string, string>();
  function onAgentFile(rel: string) {
    if (!SESSION_DOC_PATH.test(rel)) return;
    const doc = readAgentDoc(abs, rel);
    if (!doc) return;
    const text = JSON.stringify(doc);
    if (sentDocs.get(rel) === text) return;
    sentDocs.set(rel, text);
    send(`event: agent\ndata: ${text}\n\n`);
  }
  // Session docs are replaced by rename, which recursive fs.watch on Linux reports only once per file,
  // so they are polled by mtime. A killed agent writes nothing more: running sessions are re-read to notice.
  const mtimes = new Map<string, number>();
  let ticks = 0;
  const liveness = setInterval(() => {
    const recheck = ++ticks % 10 === 0;
    let names: string[] = [];
    try {
      names = readdirSync(path.join(abs, agentPaths.sessions)).filter((n) => n.endsWith('.json'));
    } catch {
      return;
    }
    for (const n of names) {
      const rel = `${agentPaths.sessions}/${n}`;
      const m = statSync(path.join(abs, rel), { throwIfNoEntry: false })?.mtimeMs;
      if (m === undefined) continue;
      if (mtimes.get(rel) !== m || (recheck && sentDocs.get(rel)?.includes('"status":"running"'))) {
        mtimes.set(rel, m);
        onAgentFile(rel);
      }
    }
  }, 500);
  liveness.unref?.();

  const unwatch = fs.watch!((rel) => {
    if (isAgentPath(rel)) return onAgentFile(rel);
    if (isOutboxPath(rel) || rel.startsWith(`${JOURNAL_DIR}/`) || rel === JOURNAL_DIR) return;
    send(`data: ${JSON.stringify({ path: rel })}\n\n`);
    if (DECISION_PATH.test(rel)) void onDecisionFile(rel);
  });

  return () => {
    unwatch();
    clearInterval(liveness);
  };
}
