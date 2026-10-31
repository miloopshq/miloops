import { rmSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import { agentPaths, type CommandCenterLock } from './agentLink';

/** Claims the tracker for this process's command center; returns the release function. */
export function writeCommandCenterLock(root: string, url: string) {
  const lock: CommandCenterLock = { url, pid: process.pid, startedAt: Date.now() };
  writeJsonAtomic(path.join(root, agentPaths.lock), lock);
  return () => {
    const cur = readJsonFile<CommandCenterLock>(path.join(root, agentPaths.lock));
    if (cur?.pid === process.pid) rmSync(path.join(root, agentPaths.lock), { force: true });
  };
}

/** The running command center for this tracker, if any. */
export function readCommandCenterLock(root: string): CommandCenterLock | undefined {
  const lock = readJsonFile<CommandCenterLock>(path.join(root, agentPaths.lock));
  return lock && processAlive(lock.pid) ? lock : undefined;
}
