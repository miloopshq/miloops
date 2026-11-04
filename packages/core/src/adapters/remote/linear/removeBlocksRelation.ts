import type { LinearGql } from './linearGql';

const RELATIONS_QUERY = `query Relations($id: String!) {
  issue(id: $id) { inverseRelations(first: 50) { nodes { id type issue { id } } } }
}`;

interface Relations {
  issue: { inverseRelations: { nodes: { id: string; type: string; issue: { id: string } }[] } } | null;
}

/** Deletes every "blocker blocks blocked" relation; none left (or the issue gone) is not an error. */
export async function removeBlocksRelation(gql: LinearGql, blockerId: string, blockedId: string) {
  const d = await gql<Relations>(RELATIONS_QUERY, { id: blockedId });
  const ids = (d.issue?.inverseRelations.nodes ?? [])
    .filter((r) => r.type === 'blocks' && r.issue.id === blockerId)
    .map((r) => r.id);
  for (const id of ids)
    await gql(`mutation Unblock($id: String!) { issueRelationDelete(id: $id) { success } }`, { id });
}
