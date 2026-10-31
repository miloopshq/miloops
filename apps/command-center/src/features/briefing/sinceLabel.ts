import { dur } from '../../lib';

export const DAY = 86_400_000;

export function sinceLabel(since: number, now: number) {
  const d = new Date(since);
  const hm = d.toTimeString().slice(0, 5);
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - DAY).toDateString();
  const day =
    d.toDateString() === today
      ? ''
      : d.toDateString() === yesterday
        ? ' yesterday'
        : ` ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return `Since ${hm}${day} · ${dur(now - since)}`;
}
