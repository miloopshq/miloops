import { callsign } from '@miloops-hq/core';

export const OPERATOR = 'operator';

export const WORK_AGENTS = [33, 8, 27, 41].map((n) => callsign(n));
