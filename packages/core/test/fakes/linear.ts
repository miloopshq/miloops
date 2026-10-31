/**
 * In-memory stand-in for the slice of Linear's GraphQL API the adapter uses,
 * dispatched on operation name. Field names follow the live schema
 * (introspected from api.linear.app); used to record the flow fixtures.
 */
interface LIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  stateId: string;
  labelIds: string[];
  parentId?: string;
  projectId?: string;
}

export function fakeLinear(opts: { start?: number } = {}) {
  let clock = opts.start ?? Date.UTC(2026, 9, 31, 12, 0, 0);
  const tick = () => new Date((clock += 1000)).toISOString();
  let n = 0;
  const uid = (p: string) => `${p}-${String(++n).padStart(4, '0')}-fake`;
  const team = { id: 'team-eng', key: 'ENG', name: 'Engineering' };
  const states = [
    { id: 'st-backlog', name: 'Backlog', type: 'backlog', position: 0 },
    { id: 'st-todo', name: 'Todo', type: 'unstarted', position: 1 },
    { id: 'st-done', name: 'Done', type: 'completed', position: 3 },
    { id: 'st-canceled', name: 'Canceled', type: 'canceled', position: 4 },
    { id: 'st-dup', name: 'Duplicate', type: 'canceled', position: 5 },
  ];
  const labels = new Map<string, { id: string; name: string; teamId: string | null }>([
    ['lbl-bug', { id: 'lbl-bug', name: 'Bug', teamId: null }],
  ]);
  const issues = new Map<string, LIssue>();
  const comments: { id: string; issueId: string; body: string; createdAt: string; updatedAt: string; user: string }[] =
    [];
  const relations: { issueId: string; relatedIssueId: string; type: string }[] = [];
  let seq = 0;

  const stateOf = (i: LIssue) => states.find((s) => s.id === i.stateId)!;
  const view = (i: LIssue, withRel: boolean): Record<string, unknown> => ({
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    description: i.description,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    completedAt: i.completedAt,
    canceledAt: i.canceledAt,
    state: { type: stateOf(i).type },
    labels: { nodes: i.labelIds.map((id) => ({ id, name: labels.get(id)!.name })) },
    assignee: null,
    comments: {
      nodes: comments
        .filter((c) => c.issueId === i.id)
        .map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, user: { displayName: c.user } })),
    },
    ...(withRel
      ? {
          inverseRelations: {
            nodes: relations
              .filter((r) => r.relatedIssueId === i.id)
              .map((r) => ({ type: r.type, issue: { id: r.issueId } })),
          },
        }
      : {}),
  });

  function create(input: Record<string, unknown>) {
    const now = tick();
    const i: LIssue = {
      id: uid('iss'),
      identifier: `${team.key}-${++seq}`,
      title: String(input.title),
      description: (input.description as string) ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      canceledAt: null,
      stateId: 'st-todo',
      labelIds: (input.labelIds as string[]) ?? [],
      parentId: input.parentId as string | undefined,
      projectId: input.projectId as string | undefined,
    };
    issues.set(i.id, i);
    return i;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GraphQL variables arrive untyped
  function op(name: string, v: Record<string, any>): unknown {
    switch (name) {
      case 'Test':
        return { viewer: { name: 'Ada Ops' }, organization: { name: 'Octo Inc' }, teams: { nodes: [team] } };
      case 'Projects':
        return { team: { projects: { nodes: [{ id: 'proj-mobile', name: 'Mobile' }] } } };
      case 'Team':
        return {
          team: v.id === team.id ? { ...team, states: { nodes: states } } : null,
          issueLabels: {
            nodes: [...labels.values()]
              .filter((l) => l.name.startsWith(v.prefix))
              .map((l) => ({ id: l.id, name: l.name, team: l.teamId ? { id: l.teamId } : null })),
          },
        };
      case 'Label': {
        const l = { id: uid('lbl'), name: v.input.name, teamId: v.input.teamId };
        labels.set(l.id, l);
        return { issueLabelCreate: { issueLabel: { id: l.id, name: l.name } } };
      }
      case 'Missions': {
        const want = v.filter.labels.some.name.eq;
        const nodes = [...issues.values()].filter(
          (i) =>
            i.labelIds.some((id) => labels.get(id)!.name === want) &&
            (!v.filter.project || i.projectId === v.filter.project.id.eq),
        );
        return { issues: { nodes: nodes.map((i) => ({ id: i.id, identifier: i.identifier, title: i.title })) } };
      }
      case 'Mission': {
        const root = issues.get(v.id);
        if (!root) return { issue: null };
        const kids = [...issues.values()].filter((i) => i.parentId === root.id);
        return { issue: { ...view(root, false), children: { nodes: kids.map((k) => view(k, true)) } } };
      }
      case 'Changes': {
        const since = v.issues.updatedAt.gt;
        return {
          issues: {
            nodes: [...issues.values()]
              .filter((i) => i.updatedAt > since)
              .map((i) => ({
                id: i.id,
                updatedAt: i.updatedAt,
                parent: i.parentId ? { id: i.parentId } : null,
                labels: { nodes: i.labelIds.map((id) => ({ name: labels.get(id)!.name })) },
              })),
          },
          comments: {
            nodes: comments
              .filter((c) => c.updatedAt > since)
              .map((c) => ({
                updatedAt: c.updatedAt,
                issue: {
                  id: c.issueId,
                  parent: issues.get(c.issueId)!.parentId ? { id: issues.get(c.issueId)!.parentId } : null,
                },
              })),
          },
        };
      }
      case 'Create':
        return { issueCreate: { issue: view(create(v.input), false) } };
      case 'Update': {
        const i = issues.get(v.id)!;
        const inp = v.input;
        if (inp.description !== undefined) i.description = inp.description;
        if (inp.stateId) {
          i.stateId = inp.stateId;
          const t = stateOf(i).type;
          i.completedAt = t === 'completed' ? tick() : null;
          i.canceledAt = t === 'canceled' ? tick() : null;
        }
        if (inp.addedLabelIds) i.labelIds = [...new Set([...i.labelIds, ...inp.addedLabelIds])];
        if (inp.removedLabelIds) i.labelIds = i.labelIds.filter((x) => !inp.removedLabelIds.includes(x));
        i.updatedAt = tick();
        return { issueUpdate: { success: true } };
      }
      case 'Block':
        relations.push({ issueId: v.input.issueId, relatedIssueId: v.input.relatedIssueId, type: v.input.type });
        return { issueRelationCreate: { success: true } };
      case 'Comment': {
        const now = tick();
        const c = {
          id: uid('cmt'),
          issueId: v.input.issueId,
          body: v.input.body,
          createdAt: now,
          updatedAt: now,
          user: 'Ada Ops',
        };
        comments.push(c);
        return { commentCreate: { comment: { id: c.id } } };
      }
      case 'EditComment': {
        const c = comments.find((x) => x.id === v.id)!;
        c.body = v.input.body;
        c.updatedAt = tick();
        return { commentUpdate: { success: true } };
      }
    }
    throw new Error(`fake linear: unsupported operation ${name}`);
  }

  const fetch = async (_input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const { query, variables } = JSON.parse(String(init.body));
    const name = String(query).match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1] ?? '';
    const headers = {
      'content-type': 'application/json',
      'x-ratelimit-requests-limit': '1500',
      'x-ratelimit-requests-remaining': '1490',
      'x-ratelimit-requests-reset': String(clock + 3_600_000),
    };
    return new Response(JSON.stringify({ data: op(name, variables ?? {}) }), { status: 200, headers });
  };

  return {
    team,
    issues,
    fetch: fetch as typeof globalThis.fetch,
    human: {
      complete(id: string) {
        const i = issues.get(id)!;
        i.stateId = 'st-done';
        i.completedAt = tick();
        i.updatedAt = tick();
      },
      comment(issueId: string, user: string, body: string) {
        const now = tick();
        comments.push({ id: uid('cmt'), issueId, body, createdAt: now, updatedAt: now, user });
      },
    },
  };
}
