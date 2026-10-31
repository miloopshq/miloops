import fs from 'node:fs';
import path from 'node:path';
import { agentPaths, type HostSessionLink } from '@miloops-hq/core';
import { ls, recent } from './quietFs';

const DAY = 86_400_000;

/** Claude Code's folder name for a project: every character outside [A-Za-z0-9] becomes `-`. */
export const claudeProjectDirName = (dir: string) => dir.replace(/[^a-zA-Z0-9]/g, '-');

/**
 * Claude Code transcripts that may be this agent's, most likely first: links
 * written by the SessionStart hook, `$CLAUDE_CODE_SESSION_ID`, then the newest
 * transcripts of the project.
 */
export function claudeCandidates(root: string, env: NodeJS.ProcessEnv, cwd: string, home: string) {
  const since = Date.now() - 2 * DAY;
  const out: string[] = [];
  const links = path.join(root, agentPaths.hosts);
  for (const n of ls(links)) {
    try {
      const l = JSON.parse(fs.readFileSync(path.join(links, n), 'utf8')) as HostSessionLink;
      if (l.agent === 'claude-code' && l.at >= since && l.transcriptPath) out.push(l.transcriptPath);
    } catch {
      // not a link
    }
  }
  const config = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const dir = path.join(config, 'projects', claudeProjectDirName(env.CLAUDE_PROJECT_DIR || cwd));
  if (env.CLAUDE_CODE_SESSION_ID) out.push(path.join(dir, `${env.CLAUDE_CODE_SESSION_ID}.jsonl`));
  const byAge = ls(dir)
    .filter((n) => n.endsWith('.jsonl'))
    .map((n) => path.join(dir, n))
    .filter((f) => recent(f, since))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 12);
  return [...new Set([...out, ...byAge])].filter((f) => recent(f, since));
}

/** The Codex rollout file of `thread`, searching the newest 400 days of sessions. */
export function findCodexRollout(thread: string, env: NodeJS.ProcessEnv, home: string) {
  const sessions = path.join(env.CODEX_HOME || path.join(home, '.codex'), 'sessions');
  const desc = (dir: string) => ls(dir).sort().reverse();
  let days = 0;
  for (const y of desc(sessions))
    for (const m of desc(path.join(sessions, y)))
      for (const d of desc(path.join(sessions, y, m))) {
        if (++days > 400) return undefined;
        const dir = path.join(sessions, y, m, d);
        const hit = ls(dir).find((n) => n.startsWith('rollout-') && n.endsWith(`-${thread}.jsonl`));
        if (hit) return path.join(dir, hit);
      }
  return undefined;
}
