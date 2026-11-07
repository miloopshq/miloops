/** Tracker connectors and agent integrations, as surfaced in Settings. */

export type ConnectorId = 'markdown' | 'github' | 'linear';

export interface ConnectorInfo {
  id: ConnectorId;
  name: string;
  status: 'available' | 'stub';
}

export const CONNECTORS: ConnectorInfo[] = [
  { id: 'markdown', name: 'Local markdown', status: 'available' },
  { id: 'github', name: 'GitHub Issues', status: 'available' },
  { id: 'linear', name: 'Linear', status: 'available' },
];

export interface AgentIntegration {
  id: 'claude-code' | 'codex' | 'cursor';
  name: string;
  status: 'primary' | 'planned';
  /** Prefix for session trail names in the Lookout, e.g. claude-07. */
  trailName: string;
}

export const AGENT_INTEGRATIONS: AgentIntegration[] = [
  { id: 'claude-code', name: 'Claude Code', status: 'primary', trailName: 'claude' },
  { id: 'codex', name: 'Codex', status: 'primary', trailName: 'codex' },
  { id: 'cursor', name: 'Cursor', status: 'planned', trailName: 'cursor' },
];

export const PRIMARY_AGENT = AGENT_INTEGRATIONS[0];

export const trailName = (n: number, agent = PRIMARY_AGENT) => `${agent.trailName}-${String(n).padStart(2, '0')}`;

/** How a HITL conversation is written back to its ticket. */
export type HitlTranscriptMode = 'full' | 'summary';
