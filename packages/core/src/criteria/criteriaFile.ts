import { isCriterionKind, type Criterion, type TicketCriteria } from './criteria';

/**
 * `criteria/<mapId>.md`: one `##` section per ticket, `## #12 · Build changelog search (id 12) · confirmed`, then one
 * line per criterion: `- AC-1 (unit) Search matches release titles` or `- AC-2 (business-rule, K-3) …`.
 */
export function serializeCriteria(title: string, tickets: TicketCriteria[]) {
  const parts = tickets
    .filter((t) => t.criteria.length)
    .map(
      (t) =>
        `## ${t.ticketKey} (id ${t.ticketId})${t.confirmed ? ' · confirmed' : ''}\n\n` +
        t.criteria.map((c) => `- ${c.id} (${c.kind}${c.source ? `, ${c.source}` : ''}) ${c.text}`).join('\n'),
    );
  return `# Acceptance criteria: ${title}\n\n${parts.join('\n\n')}\n`;
}

const LINE = /^-\s+(AC-\d+)\s+\(([\w-]+)(?:,\s*([\w-]+))?\)\s+(.+)$/;
const HEAD = /^(.*?)\s+\(id ([^)]+)\)(\s+·\s+confirmed)?\s*$/;

export function parseCriteria(md: string): TicketCriteria[] {
  const out: TicketCriteria[] = [];
  for (const part of md.split(/^##\s+/m).slice(1)) {
    const nl = part.indexOf('\n');
    const head = HEAD.exec(part.slice(0, nl === -1 ? undefined : nl).trim());
    if (!head) continue;
    const criteria: Criterion[] = [];
    for (const line of (nl === -1 ? '' : part.slice(nl + 1)).split('\n')) {
      const m = LINE.exec(line.trim());
      if (!m || !isCriterionKind(m[2])) continue;
      criteria.push({ id: m[1], kind: m[2], text: m[4].trim(), ...(m[3] ? { source: m[3] } : {}) });
    }
    out.push({ ticketKey: head[1], ticketId: head[2], criteria, ...(head[3] ? { confirmed: true } : {}) });
  }
  return out;
}
