import type { Comment } from '@miloops-hq/core';
import { Meta } from '../../components/ui';

/** The ticket's comments besides its resolution, folded away. */
export function OtherComments({ comments }: { comments: Comment[] }) {
  if (!comments.length) return null;
  const plural = comments.length > 1 ? 's' : '';
  return (
    <details className="comments">
      <summary className="mono-label">
        {comments.length} other comment{plural}
      </summary>
      {comments.map((c) => (
        <div key={c.id} className="comment">
          <Meta parts={[c.author]} />
          <div className="c-body">{c.body.replace(/\*\*/g, '')}</div>
        </div>
      ))}
    </details>
  );
}
