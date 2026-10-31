import type { GitEvidence } from '../model/evidence';

const short = (sha?: string | null) => sha?.slice(0, 8) ?? 'none';

/** The git evidence of an attempt as the ticket comment shows it. */
export function evidenceLines(g: GitEvidence): string[] {
  const where = g.tree
    ? ` · ${g.base ? `${short(g.base.head)} → ` : ''}${short(g.tree.head)} on ${g.tree.branch ?? 'detached HEAD'}`
    : '';
  const files = `${g.stats.files} file${g.stats.files === 1 ? '' : 's'} changed (+${g.stats.add} −${g.stats.del})`;
  return [
    `Git: ${g.tree ? files : 'not tracked'}${where}`,
    ...g.flags.filter((f) => f.kind !== 'no-git').map((f) => `- ${f.kind}: ${f.message}`),
  ];
}
