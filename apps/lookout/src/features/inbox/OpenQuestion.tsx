import type { PendingQuestion } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { clock } from '../../lib';
import { QuestionAvatar } from './QuestionAvatar';

/**
 * The question you're answering, pinned between the transcript and the suggested replies so it never scrolls out
 * of view in a short column. Scout sits beside it; the text scrolls on its own if it's very long.
 */
export function OpenQuestion(props: { q: PendingQuestion; chatId?: string }) {
  const { q } = props;
  return (
    <div className="msg open-q">
      <MetaLine parts={[q.agent, clock(q.at)]} />
      <QuestionAvatar id={props.chatId ?? q.id} text={q.text} />
      <div className="msg-text">{q.text}</div>
    </div>
  );
}
