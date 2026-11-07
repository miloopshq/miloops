import { dur } from '../../lib';

export const DAY = 86_400_000;

export function sinceLabel(since: number, now: number) {
  const d = new Date(since);
  const hm = d.toTimeString().slice(0, 5);
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - DAY).toDateString();
  let day = ` ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  if (d.toDateString() === today) day = '';
  else if (d.toDateString() === yesterday) day = ' yesterday';
  return `Since ${hm}${day} · ${dur(now - since)}`;
}
