export function wrap(s: string, n: number, lines = 2) {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n) {
      out.push(cur.trim());
      cur = w;
    } else cur += ' ' + w;
  }
  out.push(cur.trim());
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = kept[lines - 1].slice(0, n - 1) + '…';
    return kept;
  }
  return out;
}
