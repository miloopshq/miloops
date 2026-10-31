import { redact } from '../../verification/redact';

/**
 * Pull request text is written by whoever opened the PR. It is only matched
 * against fixed patterns or kept as short, inert display text: control
 * characters and markup brackets are dropped, whitespace is collapsed and the
 * length is capped, so it cannot pose as structure or instructions downstream.
 */
export function untrusted(text: unknown, max = 120): string {
  if (typeof text !== 'string') return '';
  const flat = redact(text)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

const ID = '[A-Za-z0-9][\\w.-]{0,63}';
const MARKER = new RegExp(`miloops:(${ID})#(${ID})`, 'g');
const BRANCH = new RegExp(`(?:^|/)miloops-([A-Za-z0-9][\\w.]{0,63})-(${ID})$`);

/** Key of a ticket as markers and branch names spell it. */
export const ticketRef = (mapId: string, ticketId: string) => `${mapId}#${ticketId}`;

/** `<mapId>#<ticketId>` for each `miloops:<mapId>#<ticketId>` in a PR body, at most 20. */
export function bodyMarkers(body: unknown): string[] {
  if (typeof body !== 'string') return [];
  const out = new Set<string>();
  for (const m of body.slice(0, 65_536).matchAll(MARKER)) {
    out.add(ticketRef(m[1], m[2].replace(/[.-]+$/, '')));
    if (out.size >= 20) break;
  }
  return [...out];
}

/**
 * `<mapId>#<ticketId>` when the branch is named `miloops-<mapId>-<ticketId>`,
 * optionally under a prefix (`cursor/miloops-3-12`). Ids with a dash are only
 * reachable through a body marker.
 */
export function branchRef(ref: string): string | undefined {
  const m = ref.match(BRANCH);
  return m ? ticketRef(m[1], m[2]) : undefined;
}
