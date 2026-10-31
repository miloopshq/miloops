import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export function gitEmail(cwd: string) {
  try {
    return execFileSync('git', ['config', '--get', 'user.email'], {
      cwd: existsSync(cwd) ? cwd : undefined,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}
