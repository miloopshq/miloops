import { spawn } from 'node:child_process';

export function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => process.stdout.write(`  Open ${url} in your browser.\n`));
    child.unref();
  } catch {
    process.stdout.write(`  Open ${url} in your browser.\n`);
  }
}
