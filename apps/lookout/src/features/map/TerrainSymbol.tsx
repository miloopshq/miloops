import type { TerrainSprite } from './terrain';

const ART: Record<TerrainSprite, string[]> = {
  pine: [
    '....P....',
    '...PPP...',
    '...PpP...',
    '..PPPPP..',
    '..PPpPP..',
    '.PPPPPPP.',
    '.PPpPpPP.',
    'PPPPPPPPP',
    '....T....',
    '....T....',
  ],
  oak: [
    '..OOOOO..',
    '.OOoOOOO.',
    'OOOOOOOoO',
    'OoOOOoOOO',
    'OOOOOOOOO',
    '.OOoOOOO.',
    '..OOOOO..',
    '....T....',
    '....T....',
  ],
  rock: ['..sss..', '.sssSs.', 'ssssSSs', 'sSsSSSs'],
  tuft: ['p..p..p', '.p.p.p.'],
};
const FILL: Record<string, string> = {
  P: 'var(--map-pine)',
  p: 'var(--map-pine2)',
  O: 'var(--map-oak)',
  o: 'var(--map-oak2)',
  T: 'var(--map-trunk)',
  s: 'var(--map-rock)',
  S: 'var(--map-rock2)',
};

export function TerrainSymbol({ name }: { name: TerrainSprite }) {
  return (
    <symbol id={`terrain-${name}`} overflow="visible">
      {ART[name].flatMap((row, y) =>
        [...row].map((key, x) =>
          key === '.' ? null : <rect key={`${x}-${y}`} x={x * 4} y={y * 4} width={4} height={4} fill={FILL[key]} />,
        ),
      )}
    </symbol>
  );
}

export const SPRITE_NAMES = Object.keys(ART) as TerrainSprite[];
