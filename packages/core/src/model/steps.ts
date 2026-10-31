import type { SessionMode } from './types';

/** The ordered steps of each procedure, as shown in step tags like "WORK 2/5". */
export const STEPS: Record<SessionMode, readonly string[]> = {
  chart: ['Name destination', 'Find frontier', 'Create mission', 'Create tickets + wire blocking', 'Fire research'],
  work: ['Load mission', 'Claim', 'Resolve', 'Record', 'Update plan'],
  research: ['Claim', 'Investigate', 'Record'],
};

export const stepTag = (mode: SessionMode, n: number) => `${mode[0].toUpperCase()}${mode.slice(1)} ${n}/${STEPS[mode].length}`;
