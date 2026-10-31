// Hero install block: the Claude Code / Codex picker swaps the connect command and its copy target.

const AGENTS = {
  claude: { name: 'Claude Code', cmd: 'npx miloops connect claude' },
  codex: { name: 'Codex', cmd: 'npx miloops connect codex' },
} as const;

type AgentId = keyof typeof AGENTS;

const isAgent = (id: string | undefined): id is AgentId => !!id && id in AGENTS;

export function mountAgentPicker(root: ParentNode = document) {
  const picker = root.querySelector('[data-agent-picker]');
  if (!picker) return;
  const buttons = Array.from(picker.querySelectorAll<HTMLButtonElement>('button[data-agent]'));
  const cmd = root.querySelector('[data-agent-cmd]');
  const copy = root.querySelector<HTMLButtonElement>('[data-agent-copy]');

  const select = (id: AgentId) => {
    const agent = AGENTS[id];
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.agent === id)));
    if (cmd) cmd.textContent = agent.cmd;
    if (copy) {
      copy.dataset.copy = agent.cmd;
      copy.setAttribute('aria-label', `Copy the ${agent.name} connect command`);
    }
  };

  for (const button of buttons) {
    const id = button.dataset.agent;
    if (isAgent(id)) button.addEventListener('click', () => select(id));
  }
  select('claude');
}
