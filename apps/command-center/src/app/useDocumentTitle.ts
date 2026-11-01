import { BRAND } from '@miloops-hq/core';
import { useEffect } from 'react';

/** Tab title: the brand first, then the waiting count and the mission. */
export function useDocumentTitle(pending: number, mission: string | undefined) {
  useEffect(() => {
    document.title = `${BRAND.name}: ${pending ? `(${pending}) ` : ''}${mission ?? 'No mission'}`;
  }, [pending, mission]);
}
