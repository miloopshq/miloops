import { readFileSync } from 'node:fs';
import path from 'node:path';
import { splitForImport } from '@miloops-hq/core';
import { nextKnowledgeId, writeKnowledge } from '@miloops-hq/core/agents';

/** `miloops knowledge import <file.md>`: one suggested entry per `##` heading, for the operator to review. */
export function importKnowledge(root: string, file: string) {
  const parts = splitForImport(readFileSync(file, 'utf8'), path.basename(file));
  const now = Date.now();
  const ids: string[] = [];
  for (const p of parts) {
    const id = nextKnowledgeId(root);
    writeKnowledge(root, {
      id,
      title: p.title,
      body: p.body,
      kind: 'fact',
      status: 'suggested',
      scope: [],
      tags: [],
      sources: p.sources,
      anchors: [],
      createdBy: 'operator',
      createdAt: now,
      updatedAt: now,
    });
    ids.push(id);
  }
  return ids;
}
