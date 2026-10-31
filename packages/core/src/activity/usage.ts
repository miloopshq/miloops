import type { SessionUsage } from '../model/types';

export const addUsage = (a: SessionUsage | undefined, b: SessionUsage): SessionUsage => ({
  inputTokens: (a?.inputTokens ?? 0) + b.inputTokens,
  outputTokens: (a?.outputTokens ?? 0) + b.outputTokens,
  costUsd: (a?.costUsd ?? 0) + b.costUsd,
  ...(a?.cachedInputTokens || b.cachedInputTokens ? { cachedInputTokens: (a?.cachedInputTokens ?? 0) + (b.cachedInputTokens ?? 0) } : {}),
});

export const subUsage = (a: SessionUsage, b: SessionUsage | undefined): SessionUsage => ({
  inputTokens: a.inputTokens - (b?.inputTokens ?? 0),
  outputTokens: a.outputTokens - (b?.outputTokens ?? 0),
  costUsd: a.costUsd - (b?.costUsd ?? 0),
  ...(a.cachedInputTokens || b?.cachedInputTokens ? { cachedInputTokens: (a.cachedInputTokens ?? 0) - (b?.cachedInputTokens ?? 0) } : {}),
});
