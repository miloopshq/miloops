/** The agent's suggested replies, one click each. */
export function Suggestions(props: { options?: string[]; onPick: (text: string) => void }) {
  if (!props.options?.length) return null;
  return (
    <div className="suggest">
      {props.options.map((s) => (
        <button key={s} className="chip" onClick={() => props.onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
