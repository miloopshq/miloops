/** Whether a process with this pid is running (EPERM: it is, owned by another user). */
export function processAlive(pid: number) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}
