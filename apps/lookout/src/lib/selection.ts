/** What the inspector shows: a ticket, or an item from the trail's "not yet specified" list. */
export type Selection = { kind: 'ticket'; id: string } | { kind: 'unspecified'; item: string } | null;
