/**
 * Public list prices in USD per million tokens. Neither Claude Code transcripts
 * nor Codex rollout logs store spend per message, so cost is tokens × these
 * rates (the same rates Claude Code uses for its own `total_cost_usd`).
 */
export interface Rate {
  input: number;
  output: number;
  /** Prompt-cache reads. */
  cacheRead: number;
  /** Prompt-cache writes (Anthropic only; OpenAI does not bill them separately). */
  cacheWrite?: number;
}

const CLAUDE: [RegExp, Rate][] = [
  [/opus-4-[5-9]|opus-[5-9]/, { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  [/opus/, { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 }],
  [/haiku-4|haiku-[5-9]/, { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
  [/3-5-haiku|haiku-3-5/, { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 }],
  [/haiku/, { input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.3 }],
  [/sonnet|claude/, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }],
];

const OPENAI: [RegExp, Rate][] = [
  [/nano/, { input: 0.05, output: 0.4, cacheRead: 0.005 }],
  [/mini/, { input: 0.25, output: 2, cacheRead: 0.025 }],
  [/gpt-5\.[2-9]|gpt-[6-9]/, { input: 1.75, output: 14, cacheRead: 0.175 }],
  [/gpt-5|codex|^o\d/, { input: 1.25, output: 10, cacheRead: 0.125 }],
  [/gpt-4\.1/, { input: 2, output: 8, cacheRead: 0.5 }],
];

/** Rate for a model id; undefined for models without a known price (their tokens still count, at $0). */
export function rateFor(model: string): Rate | undefined {
  const m = model.toLowerCase();
  const table = m.includes('claude') || /opus|sonnet|haiku/.test(m) ? CLAUDE : OPENAI;
  return table.find(([re]) => re.test(m))?.[1];
}

/** Cost of one call. `input` includes cache reads and writes. */
export function priceUsage(model: string, u: { input: number; cacheRead: number; cacheWrite: number; output: number }) {
  const r = rateFor(model);
  if (!r) return 0;
  const fresh = Math.max(0, u.input - u.cacheRead - (r.cacheWrite === undefined ? 0 : u.cacheWrite));
  return (
    (fresh * r.input +
      u.cacheRead * r.cacheRead +
      (r.cacheWrite === undefined ? 0 : u.cacheWrite * r.cacheWrite) +
      u.output * r.output) /
    1e6
  );
}
