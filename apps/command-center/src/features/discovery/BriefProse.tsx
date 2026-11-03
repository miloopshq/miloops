import { Empty } from '../../components/ui';

/** Paths in backticks or bare `a/b.ts` style are shown in mono so they can be copied. */
export function BriefProse({ text }: { text: string }) {
  if (!text.trim()) return <Empty>Not covered</Empty>;
  return (
    <div className="brief-prose">
      {text.split('\n').map((line, i) => (
        <p key={i}>
          {line
            .split(/(`[^`]+`|\/?\b[\w.-]+\/[\w./-]+\b)/g)
            .map((part, j) => (j % 2 === 1 ? <code key={j}>{part.replace(/`/g, '')}</code> : part))}
        </p>
      ))}
    </div>
  );
}
