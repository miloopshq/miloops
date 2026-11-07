import type { ReactNode } from 'react';
import type { TerrainSprite } from './terrain';

const ART: Record<TerrainSprite, ReactNode> = {
  pine: (
    <>
      <rect x="16" y="30" width="4" height="10" fill="var(--map-trunk)" />
      <path d="M18 0l9 12h-4l8 10h-4l9 11H0l9-11H5l8-10H9z" fill="var(--map-pine)" />
      <path d="M18 0l9 12h-4l8 10h-4l9 11H18z" fill="var(--map-pine2)" />
    </>
  ),
  oak: (
    <>
      <rect x="16" y="24" width="4" height="12" fill="var(--map-trunk)" />
      <circle cx="18" cy="14" r="14" fill="var(--map-oak)" />
      <circle cx="10" cy="17" r="8" fill="var(--map-oak)" />
      <circle cx="26" cy="17" r="8" fill="var(--map-oak)" />
      <circle cx="22" cy="10" r="6" fill="var(--map-oak2)" />
    </>
  ),
  rock: (
    <>
      <path d="M1 16Q2 6 10 3Q18-1 23 6Q28 11 27 16z" fill="var(--map-rock)" />
      <path d="M15 16Q15 8 19 4Q25 8 27 16z" fill="var(--map-rock2)" />
    </>
  ),
  tuft: (
    <path
      d="M4 8Q3 4 1 1M14 8Q14 3 14 0M24 8Q25 4 27 1"
      fill="none"
      stroke="var(--map-pine2)"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  ),
};

export function TerrainSymbol({ name }: { name: TerrainSprite }) {
  return (
    <symbol id={`terrain-${name}`} overflow="visible">
      {ART[name]}
    </symbol>
  );
}

export const SPRITE_NAMES = Object.keys(ART) as TerrainSprite[];
