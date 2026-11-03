import type { AttentionKind, AttentionPolicy } from '../model/attention';
import { ATTENTION_KINDS, DEFAULT_ATTENTION_POLICY } from './defaults';

export interface Parsed<T> {
  /** The defaults where the file is missing or wrong, so the queue keeps working. */
  value: T;
  /** Every problem, one line each; empty when the file is valid. */
  errors: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNumberIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

const KEYS = ['v', 'weights', 'interrupt', 'digestMinutes'];

function parseWeights(raw: unknown, errors: string[]): Record<AttentionKind, number> {
  const weights = { ...DEFAULT_ATTENTION_POLICY.weights };
  if (raw === undefined) return weights;
  if (!isObject(raw)) {
    errors.push('weights: expected an object of kind → 0–100');
    return weights;
  }
  for (const [kind, w] of Object.entries(raw)) {
    if (!ATTENTION_KINDS.includes(kind as AttentionKind)) {
      errors.push(`weights.${kind}: unknown kind (one of ${ATTENTION_KINDS.join(', ')})`);
      continue;
    }
    if (isNumberIn(w, 0, 100)) weights[kind as AttentionKind] = w;
    else errors.push(`weights.${kind}: expected a number from 0 to 100`);
  }
  return weights;
}

/** `attention.json`, checked by hand like verification.json: unknown keys and bad values are all reported. */
export function parseAttentionPolicy(raw: unknown): Parsed<AttentionPolicy> {
  const errors: string[] = [];
  if (!isObject(raw)) return { value: DEFAULT_ATTENTION_POLICY, errors: ['expected a JSON object'] };
  for (const k of Object.keys(raw)) if (!KEYS.includes(k)) errors.push(`${k}: unknown key`);
  if (raw.v !== 1) errors.push('v: expected 1');
  const value: AttentionPolicy = { ...DEFAULT_ATTENTION_POLICY, weights: parseWeights(raw.weights, errors) };
  if (raw.interrupt !== undefined) {
    if (isNumberIn(raw.interrupt, 0, 200)) value.interrupt = raw.interrupt;
    else errors.push('interrupt: expected a number from 0 to 200');
  }
  if (raw.digestMinutes !== undefined) {
    if (isNumberIn(raw.digestMinutes, 0, 7 * 24 * 60)) value.digestMinutes = raw.digestMinutes;
    else errors.push('digestMinutes: expected minutes from 0 (off) to 10080');
  }
  return { value, errors };
}
