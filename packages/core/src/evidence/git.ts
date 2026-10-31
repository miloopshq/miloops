import { spawn } from 'node:child_process';

const GIT_TIMEOUT_MS = 30_000;

export interface GitResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

/** Runs `git` without a shell; never throws (a missing binary is code `null`). */
export function git(cwd: string, args: string[], input?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    let err = '';
    const child = spawn('git', args, {
      cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), GIT_TIMEOUT_MS);
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => (err += b.toString('utf8')));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: Buffer.alloc(0), stderr: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: err });
    });
  });
}

/** stdout as text when git succeeds, else undefined. */
export async function gitText(cwd: string, args: string[], input?: string) {
  const r = await git(cwd, args, input);
  return r.code === 0 ? r.stdout.toString('utf8').trim() : undefined;
}

/** NUL-separated stdout (`-z` output) as a list. */
export const zList = (b: Buffer) => b.toString('utf8').split('\0').filter(Boolean);
