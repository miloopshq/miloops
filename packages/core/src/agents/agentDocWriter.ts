import { rmSync } from 'node:fs';
import path from 'node:path';
import type { ActivityStream } from '../activity/activityStream';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { agentPaths, type AgentAnswer, type AgentSessionDoc } from './agentLink';

/**
 * Persists every session of an in-process ActivityStream as a session doc and
 * feeds answers written by the Lookout back into `activity.answer`.
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
      const ans = readJsonFile<AgentAnswer>(file);
      if (!ans) continue;
      rmSync(file, { force: true });
      this.activity.answer(q.id, ans.text, ans.author || 'trail lead');
    }
  }

  close() {
    this.off();
    clearInterval(this.poll);
    this.flush();
  }
}
