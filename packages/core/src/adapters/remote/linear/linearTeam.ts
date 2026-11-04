import { BRAND } from '../../../model/brand';
import { ALL_LABELS } from '../format';
import { TrackerError } from '../http';
import type { LinearGql } from './linearGql';
import { TEAM_QUERY } from './schema';

export interface LinearTeam {
  key: string;
  name: string;
  /** First "completed" and first "canceled" workflow state ids ('' when the team has none). */
  done: string;
  canceled: string;
  /** Where a reopened issue goes: the first "unstarted" state, else the first "backlog" one ('' when neither). */
  open: string;
  /** MILOOPS label name → id. */
  labels: Map<string, string>;
}

/** Team states and MILOOPS labels, creating the labels that are missing. */
export async function fetchLinearTeam(gql: LinearGql, teamId: string): Promise<LinearTeam> {
  const d = await gql<{
    team: { key: string; name: string; states: { nodes: { id: string; type: string; position: number }[] } } | null;
    issueLabels: { nodes: { id: string; name: string; team: { id: string } | null }[] };
  }>(TEAM_QUERY, { id: teamId, prefix: `${BRAND.labelPrefix}:` });
  if (!d.team) throw new TrackerError('not_found', `Linear: team ${teamId} not found`);
  const first = (type: string) =>
    d.team!.states.nodes.filter((s) => s.type === type).sort((a, b) => a.position - b.position)[0]?.id ?? '';
  const labels = new Map(d.issueLabels.nodes.filter((l) => !l.team || l.team.id === teamId).map((l) => [l.name, l.id]));
  for (const l of ALL_LABELS.filter((x) => !labels.has(x.name))) {
    const r = await gql<{ issueLabelCreate: { issueLabel: { id: string; name: string } } }>(
      `mutation Label($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { issueLabel { id name } } }`,
      { input: { name: l.name, color: `#${l.color}`, teamId } },
    );
    labels.set(l.name, r.issueLabelCreate.issueLabel.id);
  }
  return {
    key: d.team.key,
    name: d.team.name,
    done: first('completed'),
    canceled: first('canceled'),
    open: first('unstarted') || first('backlog'),
    labels,
  };
}
