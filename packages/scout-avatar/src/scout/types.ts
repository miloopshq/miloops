export type ScoutState = 'idle' | 'speaking' | 'alert' | 'thinking';
export type ScoutStyleId = 'crt' | 'mono' | 'night';
export type Eye = 'open' | 'closed' | 'aside' | 'wide';
export type Mouth = 'rest' | 'open' | 'mid' | 'aside';
export type Light = 'on' | 'dim' | 'alert';
export type Palette = Record<string, string>;
/** Runs of palette keys stamped onto a base sprite: [row, col, keys]. */
export type Patch = readonly (readonly [row: number, col: number, keys: string])[];
export type ScoutSize = 'xs' | 'sm' | 'md' | 'lg';
