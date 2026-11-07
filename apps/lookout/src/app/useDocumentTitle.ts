import { BRAND } from '@teamtrail/core';
import { useEffect } from 'react';

/** Tab title: the brand first, then the waiting count and the trail. */
export function useDocumentTitle(pending: number, trail: string | undefined) {
  useEffect(() => {
    document.title = `${BRAND.name}: ${pending ? `(${pending}) ` : ''}${trail ?? 'No trail'}`;
  }, [pending, trail]);
}
