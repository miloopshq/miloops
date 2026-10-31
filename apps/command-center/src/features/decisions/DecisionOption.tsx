/** One filter row in the wide decisions sidebar: label and count, highlighted when active. */
export function DecisionOption(p: { on: boolean; label: string; n: number; onClick: () => void; cls?: string }) {
  return (
    <li>
      <button className={`dv-opt ${p.on ? 'on' : ''} ${p.cls ?? ''}`} onClick={p.onClick}>
        <span className="ttl">{p.label}</span>
        <b>{p.n}</b>
      </button>
    </li>
  );
}
