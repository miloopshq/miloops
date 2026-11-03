import { iso } from '../../model/frontmatter';
import type { DecisionRecord } from '../../model/types';
import { DECISION_SOURCES, decisionStatus } from './decisionRecord';

function sourceLink(source: DecisionRecord['source']): string {
  if (source.url) return ` · [${source.label ?? 'link'}](${source.url})`;
  return source.label ? ` · ${source.label}` : '';
}

/** Markdown export of an audit list, newest first, grouped per mission. */
export function decisionsToMarkdown(
  all: DecisionRecord[],
  missions: Record<string, { key: string; title: string }>,
  opts: { title?: string; now?: number } = {},
) {
  const out = [
    `# ${opts.title ?? 'Decisions'}`,
    '',
    `Exported ${iso(opts.now ?? Date.now())} · ${all.length} decisions`,
  ];
  const groups = new Map<string, DecisionRecord[]>();
  for (const d of all) groups.set(d.mapId, [...(groups.get(d.mapId) ?? []), d]);
  for (const [mapId, ds] of groups) {
    const m = missions[mapId];
    out.push('', `## Mission ${m ? `${m.key} ${m.title}` : mapId}`);
    for (const d of ds) {
      const src = DECISION_SOURCES[d.source.kind].label;
      out.push(
        '',
        `### ${d.id}${d.ticketKey ? ` · ${d.ticketKey}` : ''} · ${d.question}`,
        '',
        `- **Status:** ${decisionStatus(d)}${d.supersededBy ? ` (superseded by ${d.supersededBy})` : ''}${d.supersedes ? ` · supersedes ${d.supersedes}` : ''}`,
        `- **Decided by:** ${d.decidedBy} · ${iso(d.decidedAt)}`,
        `- **Source:** ${src}${sourceLink(d.source)}`,
        ...(d.participants.length
          ? [`- **Participants:** ${d.participants.map((p) => p.name ?? p.id).join(', ')}`]
          : []),
        '',
        `**Decision:** ${d.answer}`,
        ...(d.alternatives.length ? ['', '**Alternatives:**', ...d.alternatives.map((a) => `- ${a}`)] : []),
        ...(d.rationale ? ['', `**Rationale:** ${d.rationale}`] : []),
        ...(d.transcript.length
          ? [
              '',
              '<details><summary>Transcript</summary>',
              '',
              ...d.transcript.map((e) => `> **${e.author}:** ${e.text.replace(/\n/g, '\n> ')}\n>`),
              '',
              '</details>',
            ]
          : []),
      );
    }
  }
  return out.join('\n') + '\n';
}
