import { useState } from 'react';
import { Button } from '../../components/ui';
import { type KnowledgeDraft, useKnowledge } from './knowledgeContext';

/** Turns something already on record (a decision, a cancelled ticket, a brief section) into a knowledge suggestion. */
export function PromoteButton({ draft, label = 'Save as knowledge' }: { draft: () => KnowledgeDraft; label?: string }) {
  const k = useKnowledge();
  const [saved, setSaved] = useState<string>();
  if (saved)
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => k.setOpen(true)}
        data-tip="Open it in the field guide to confirm it"
      >
        Saved as {saved}
      </Button>
    );
  return (
    <Button
      size="sm"
      variant="ghost"
      data-tip="Add it to the field guide as a suggestion; confirm it there and agents get it with related work"
      onClick={() => void k.propose(draft()).then((e) => e && setSaved(e.id))}
    >
      {label}
    </Button>
  );
}
