export function Wordmark({ text }: { text: string }) {
  const [lead, tone] = text.split('|');
  return (
    <div className="wordmark">
      {lead}
      {tone && <span className="wordmark-ops">{tone}</span>}
    </div>
  );
}
