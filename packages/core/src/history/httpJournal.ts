import type { Journal } from '../model/lifecycle';

/** The command center's journal: transitions made in the browser are appended by the local `miloops` server. */
export function httpJournal(apiPrefix: string): Journal {
  return {
    async append(entry) {
      await fetch(`${apiPrefix}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    },
  };
}
