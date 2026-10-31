import { BRAND } from '@miloops-hq/core';
import { useState, useEffect } from 'react';

/** Repo name shown in the header: the folder that contains the tracker data. */
export function useRepoName(kind: string) {
  const [name, setName] = useState(kind === 'demo' ? 'demo' : '…');
  useEffect(() => {
    if (kind === 'demo') return;
    fetch(`${BRAND.apiPrefix}/list`)
      .then((r) => r.json())
      .then((j: { root: string }) => {
        const parts = j.root.split('/').filter(Boolean);
        setName(
          parts[parts.length - 1]?.startsWith('.')
            ? (parts[parts.length - 2] ?? 'repo')
            : (parts[parts.length - 1] ?? 'repo'),
        );
      })
      .catch(() => setName('repo'));
  }, [kind]);
  return name;
}
