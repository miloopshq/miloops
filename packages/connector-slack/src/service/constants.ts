import { BRAND, type Ticket } from '@miloops-hq/core';

export const AUTH_CODES = new Set([
  'invalid_auth',
  'not_authed',
  'account_inactive',
  'token_revoked',
  'token_expired',
  'no_permission',
]);
export const REFUSED = `Only the ${BRAND.name} owner and allowed users can do that. Ask the owner to add you in ${BRAND.name} Settings → Slack.`;
export const ALREADY = `Already answered in ${BRAND.name}.`;
const DECISION_TYPES = new Set<Ticket['type']>(['grilling', 'prototype']);
export const isDecisionTicket = (t: Ticket) =>
  t.state === 'open' && (DECISION_TYPES.has(t.type) || (t.type === 'task' && !!t.hitl));
export const day = (t: number) => new Date(t).toISOString().slice(0, 10);
