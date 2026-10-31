/** Tracker connectors and agent integrations, as surfaced in Settings. */

export type ConnectorId = 'markdown' | 'demo' | 'github' | 'linear';

export interface ConnectorInfo {
  id: ConnectorId;
  name: string;
  status: 'available' | 'stub';
}

export const CONNECTORS: ConnectorInfo[] = [
  { id: 'markdown', name: 'Local markdown', status: 'available' },
  { id: 'demo', name: 'Demo tracker', status: 'available' },
  { id: 'github', name: 'GitHub Issues', status: 'stub' },
  { id: 'linear', name: 'Linear', status: 'stub' },
];

export interface AgentIntegration {
  id: 'claude-code' | 'codex' | 'cursor';
  name: string;
  status: 'primary' | 'planned';
  /** Prefix for session callsigns in the HUD, e.g. claude-07. */
  callsign: string;
}

export const AGENT_INTEGRATIONS: AgentIntegration[] = [
  { id: 'claude-code', name: 'Claude Code', status: 'primary', callsign: 'claude' },
  { id: 'codex', name: 'Codex', status: 'planned', callsign: 'codex' },
  { id: 'cursor', name: 'Cursor', status: 'planned', callsign: 'cursor' },
];

export const PRIMARY_AGENT = AGENT_INTEGRATIONS[0];

export const callsign = (n: number, agent = PRIMARY_AGENT) => `${agent.callsign}-${String(n).padStart(2, '0')}`;

/** How a HITL conversation is written back to its ticket. */
export type HitlTranscriptMode = 'full' | 'summary';
