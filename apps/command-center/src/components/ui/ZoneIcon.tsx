const COLORS: Record<string, string> = {
  K: '#1d2622',
  W: '#f4eedc',
  g: '#3f6b45',
  o: '#c8581e',
  O: '#e8833a',
  b: '#2a6f86',
  B: '#6fb6cb',
  f: '#f0c869',
  t: '#6e4a2e',
  R: '#c4301f',
  p: '#b9562a',
};

const ART = {
  map: [
    'KKKK.KKKK.KKKK',
    'KWWKKWWWKKWWWK',
    'KWgWKWoWWKWbbK',
    'KggWKWWoWKWbbK',
    'KWgWKWWWoKWWWK',
    'KWWWKWWWWKWWWK',
    'KWWWKoWWWKWWoK',
    'KWWWKWoWoKWoWK',
    'KWWKKWWoWKKWoK',
    'KKKK.KKKK.KKKK',
  ],
  note: [
    '......KK......',
    '.....KBbK.....',
    'KKKKKKKKKKKKKK',
    'KffffffffffffK',
    'KfKKKKKKKKKKfK',
    'KffffffffffffK',
    'KfKKKKKKKKfffK',
    'KffffffffffffK',
    'KfKKKKKfffffKK',
    'KfffffffffffKK',
    'KKKKKKKKKKKKK.',
  ],
  book: [
    'KKKKKKKKKKKKKK',
    'KgKWWWWWWWWWWK',
    'KgKWKKKKKKKWWK',
    'KgKWWWWWWWWWWK',
    'KgKWKKKKKWWWWK',
    'KgKWWWWWWWWWWK',
    'KgKWKKKKKKKWWK',
    'KgKWWWWWWWWWWK',
    'KgKWWWWWWWWWWK',
    'KKKKKKKKKKKKKK',
  ],
  flag: [
    'KK............',
    'KoKKKKKKKK....',
    'KoOOOOOOOoK...',
    'KoOOOOOOOOoK..',
    'KoOOOOOOOoK...',
    'KoKKKKKKKK....',
    'KK............',
    'KK............',
    'KK............',
    'KK............',
    'KKKK..........',
  ],
  tent: [
    '.........K.........',
    '........KpK........',
    '.......KpppK.......',
    '......KpppppK......',
    '.....KpppKpppK.....',
    '....KpppKWKpppK....',
    '...KpppKWWWKpppK...',
    '..KpppKWWWWWKpppK..',
    '.KpppKWWWWWWWKpppK.',
    'KKKKKKKKKKKKKKKKKKK',
  ],
  mailbox: [
    '..KKKKKKKK..',
    '.KWWWWWWWWK.',
    'KWWWWWWWWWWK',
    'KWKKKKKKKKWK',
    'KWWWWWWWWRWK',
    'KWWWWWWWWRWK',
    'KKKKKKKKKKKK',
    '.....KtK....',
    '.....KtK....',
    '.....KtK....',
  ],
};

export type ZoneIconName = keyof typeof ART;

/** The small pixel icon next to a zone's title. Decoration only, so screen readers skip it. */
export function ZoneIcon({ name }: { name: ZoneIconName }) {
  const rows = ART[name];
  return (
    <svg
      className="zone-icon"
      aria-hidden="true"
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      width={rows[0].length * 1.5}
      height={rows.length * 1.5}
      shapeRendering="crispEdges"
    >
      {rows.flatMap((row, y) =>
        [...row].map((key, x) =>
          key === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[key]} />,
        ),
      )}
    </svg>
  );
}
