import { readFileSync } from 'node:fs';
import path from 'node:path';
import { splitForImport } from '@teamtrail/core';
import { nextKnowledgeId, writeKnowledge } from '@teamtrail/core/agents';

/** `teamtrail knowledge import <file.md>`: one suggested entry per `##` heading, for the trail lead to review. */
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
      createdBy: 'trail lead',
      createdAt: now,
      updatedAt: now,
    });
    ids.push(id);
  }
  return ids;
}
