import { BRAND } from '@miloops-hq/core';
import { useEffect } from 'react';

/** Tab title: waiting count, then the mission. */
export function useDocumentTitle(pending: number, mission: string | undefined) {
  useEffect(() => {
    document.title = `${pending ? `(${pending}) ` : ''}${mission ?? 'No mission'} · ${BRAND.name}`;
  }, [pending, mission]);
}
