import fs from 'node:fs/promises';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ActivityStream } from './activity';
import { SESSION_DOC_PATH, agentPaths, markDisconnected, type AgentAnswer, type AgentSessionDoc, type CommandCenterLock } from './agentLink';

/** Node side of the agent link (agentLink.ts): session docs, answers and the command-center lock under a tracker root. */

function alive(pid: number) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Write via a temp file + rename so readers never see half a document. */
export function writeJsonAtomic(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** One session doc by tracker-relative path, with dead processes shown as disconnected. */
export function readAgentDoc(root: string, rel: string): AgentSessionDoc | undefined {
  if (!SESSION_DOC_PATH.test(rel)) return undefined;
  const doc = readJson<AgentSessionDoc>(path.join(root, rel));
  if (!doc || doc.v !== 1 || !doc.session) return undefined;
  return alive(doc.pid) ? doc : markDisconnected(doc);
}

/** Session docs under `root`, newest first: running ones plus those updated in the last `recentMs`. */
export async function readAgentDocs(root: string, opts: { recentMs?: number; limit?: number } = {}): Promise<AgentSessionDoc[]> {
  const dir = path.join(root, agentPaths.sessions);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const since = Date.now() - (opts.recentMs ?? 24 * 3_600_000);
  const docs = names
    .filter((n) => n.endsWith('.json'))
    .map((n) => readAgentDoc(root, `${agentPaths.sessions}/${n}`))
    .filter((d): d is AgentSessionDoc => !!d && (d.session.status === 'running' || d.updatedAt >= since))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return docs.slice(0, opts.limit ?? 24);
}

export class AnswerError extends Error {}

/** Deliver an answer to a question a session is waiting on. Rejects questions that are not open. */
export function writeAgentAnswer(root: string, input: Omit<AgentAnswer, 'at'> & { at?: number }): AgentAnswer {
  const doc = readAgentDoc(root, agentPaths.session(input.sessionId));
  if (!doc) throw new AnswerError(`unknown session "${input.sessionId}"`);
  if (!doc.pending.some((q) => q.id === input.questionId)) throw new AnswerError(`question "${input.questionId}" is not waiting for an answer`);
  if (!input.text.trim()) throw new AnswerError('answer is empty');
  const ans: AgentAnswer = { ...input, text: input.text.trim(), at: input.at ?? Date.now() };
  writeJsonAtomic(path.join(root, agentPaths.answer(ans.sessionId, ans.questionId)), ans);
  return ans;
}

export function writeCommandCenterLock(root: string, url: string) {
  const lock: CommandCenterLock = { url, pid: process.pid, startedAt: Date.now() };
  writeJsonAtomic(path.join(root, agentPaths.lock), lock);
  return () => {
    const cur = readJson<CommandCenterLock>(path.join(root, agentPaths.lock));
    if (cur?.pid === process.pid) rmSync(path.join(root, agentPaths.lock), { force: true });
  };
}

/** The running command center for this tracker, if any. */
export function readCommandCenterLock(root: string): CommandCenterLock | undefined {
  const lock = readJson<CommandCenterLock>(path.join(root, agentPaths.lock));
  return lock && alive(lock.pid) ? lock : undefined;
}

/**
 * Persists every session of an in-process ActivityStream as a session doc and
 * feeds answers written by the command center back into `activity.answer`.
 */
export class AgentDocWriter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private poll: ReturnType<typeof setInterval> | undefined;
  private off: () => void;
  private written = new Map<string, string>();

  constructor(
    private root: string,
    private activity: ActivityStream,
    private opts: { client?: () => string | undefined; pollMs?: number } = {},
  ) {
    this.off = activity.subscribe(() => this.schedule());
    this.poll = setInterval(() => this.pullAnswers(), opts.pollMs ?? 400);
    this.poll.unref?.();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 25);
  }

  /** Write every session whose slice changed. */
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const st = this.activity.snapshot;
    for (const session of st.sessions) {
      const sid = session.id;
      const doc: Omit<AgentSessionDoc, 'updatedAt'> = {
        v: 1,
        session,
        chats: st.chats.filter((c) => c.sessionId === sid),
        pending: st.pending.filter((q) => q.sessionId === sid),
        answered: st.answered.filter((a) => a.sessionId === sid),
        feed: st.feed.filter((f) => f.sessionId === sid).slice(-200),
        client: this.opts.client?.(),
        pid: process.pid,
      };
      const key = JSON.stringify(doc);
      if (this.written.get(sid) === key) continue;
      this.written.set(sid, key);
      writeJsonAtomic(path.join(this.root, agentPaths.session(sid)), { ...doc, updatedAt: Date.now() });
    }
  }

  /** Apply answer files for questions this process is waiting on. */
  pullAnswers() {
    for (const q of this.activity.snapshot.pending) {
      const file = path.join(this.root, agentPaths.answer(q.sessionId, q.id));
      const ans = readJson<AgentAnswer>(file);
      if (!ans) continue;
      rmSync(file, { force: true });
      this.activity.answer(q.id, ans.text, ans.author || 'operator');
    }
  }

  close() {
    this.off();
    clearInterval(this.poll);
    this.flush();
  }
}
