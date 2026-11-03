import type { KnowledgeCall, KnowledgeEntry, KnowledgeKind } from '@miloops-hq/core';
import { createContext, useContext } from 'react';

export interface KnowledgeDraft {
  title: string;
  body: string;
  kind: KnowledgeKind;
  sources: string[];
  scope?: string[];
  tags?: string[];
  anchors?: string[];
}

export interface KnowledgeStore {
  entries: KnowledgeEntry[];
  /** Per entry id: anchored files changed since it was confirmed. */
  stale: Record<string, string[]>;
  /** Text from the current mission's discovery brief, for path matching in previews. */
  briefText: string;
  /** Entries that need the operator: suggestions, flags and stale confirmations. */
  attention: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  call: (id: string, call: KnowledgeCall) => Promise<boolean>;
  propose: (draft: KnowledgeDraft) => Promise<KnowledgeEntry | undefined>;
  error?: string;
}

export const KnowledgeContext = createContext<KnowledgeStore | null>(null);

export function useKnowledge() {
  const k = useContext(KnowledgeContext);
  if (!k) throw new Error('useKnowledge needs a KnowledgeContext provider');
  return k;
}
