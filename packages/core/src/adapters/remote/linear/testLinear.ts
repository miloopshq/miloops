import { describeError } from '../describeError';
import { HttpClient, linear, type HttpOptions } from '../http';
import type { TrackerTestResult } from '../types';
import { linearGql } from './linearGql';

/** Settings "Test connection": the key's user and teams, plus the projects of `teamId` when given. */
export async function testLinear(
  o: { apiKey: string; teamId?: string; apiUrl?: string } & HttpOptions,
): Promise<TrackerTestResult> {
  const http = new HttpClient(linear, { retries: 0, ...o });
  try {
    const gql = linearGql(http, o.apiKey.trim(), o.apiUrl);
    const d = await gql<{
      viewer: { name: string };
      organization: { name: string };
      teams: { nodes: { id: string; key: string; name: string }[] };
    }>(`query Test { viewer { name } organization { name } teams(first: 50) { nodes { id key name } } }`);
    const teams = d.teams.nodes;
    const team = teams.find((t) => t.id === o.teamId) ?? (teams.length === 1 ? teams[0] : undefined);
    let projects: { id: string; name: string }[] | undefined;
    if (team) {
      const p = await gql<{ team: { projects: { nodes: { id: string; name: string }[] } } }>(
        `query Projects($id: String!) { team(id: $id) { projects(first: 50) { nodes { id name } } } }`,
        { id: team.id },
      );
      projects = p.team.projects.nodes;
    }
    return {
      ok: true,
      account: `${d.viewer.name} · ${d.organization.name}`,
      target: team ? `${team.key} · ${team.name}` : undefined,
      teams,
      projects,
      rate: http.rate,
    };
  } catch (err) {
    return { ok: false, ...describeError(err, 'Linear') };
  }
}
