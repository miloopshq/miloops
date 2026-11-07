import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { EVIDENCE_DIR, readAttempts, readVerdicts } from './evidenceStore';
import { readRunLock } from './runLock';

/** Largest slice of a check log the Lookout is sent; logs themselves are capped at 1 MB. */
export const LOG_VIEW_BYTES = 256 * 1024;

/** A ticket's verification record: attempts and verdicts newest first, and the run in progress if any. */
export function ticketEvidence(root: string, mapId: string, ticketId: string) {
  return {
    attempts: readAttempts(root, mapId, ticketId).reverse(),
    verdicts: readVerdicts(root, mapId, ticketId).reverse(),
    running: readRunLock(root, mapId, ticketId),
  };
}

/**
 * The end of a check log named by its path relative to the tracker folder, as
 * written on the attempt. Anything outside `.evidence/` or not a `.log` is
 * refused, symlinks included.
 */
export function readEvidenceLog(root: string, rel: string): { text: string; clipped: boolean } | undefined {
  if (!rel.endsWith('.log')) return undefined;
  let file: string;
  let base: string;
  try {
    base = realpathSync(path.join(root, EVIDENCE_DIR));
    file = realpathSync(path.join(root, rel));
  } catch {
    return undefined;
  }
  if (!file.startsWith(base + path.sep)) return undefined;
  const size = statSync(file).size;
  const len = Math.min(size, LOG_VIEW_BYTES);
  const buf = Buffer.alloc(len);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buf, 0, len, size - len);
  } finally {
    closeSync(fd);
  }
  return { text: buf.toString('utf8'), clipped: size > len };
}
