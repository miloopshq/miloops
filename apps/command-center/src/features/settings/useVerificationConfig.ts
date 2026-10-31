import { BRAND, type VerificationConfig } from '@miloops-hq/core';
import { useEffect, useState } from 'react';

export interface VerificationConfigView {
  file: string;
  exists: boolean;
  errors: string[];
  hash?: string;
  config?: VerificationConfig;
}

/** `verification.json` as the local server reads it; undefined while loading, null without a server (static demo). */
export function useVerificationConfig() {
  const [view, setView] = useState<VerificationConfigView | null>();
  useEffect(() => {
    let live = true;
    fetch(`${BRAND.apiPrefix}/verification/config`)
      .then((r) => (r.ok ? (r.json() as Promise<VerificationConfigView>) : null))
      .then(
        (v) => live && setView(v),
        () => live && setView(null),
      );
    return () => {
      live = false;
    };
  }, []);
  return view;
}
