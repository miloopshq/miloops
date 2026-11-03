import fs from 'node:fs';
import { priceUsage } from './pricing';

/** One model call read from an agent's local log. `input` includes cache reads and writes. */
export interface UsageEvent {
  key: string;
  at: number;
  model: string;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  costUsd: number;
}

export interface LogParser {
  /** Parse one JSONL record; returns the model call it carries, if any. */
  line(o: Record<string, unknown>): UsageEvent | undefined;
  /**
   * Tool calls seen so far (Claude Code `tool_use` id, Codex `call_id`) and when the model
   * call that issued them began (just before its usage is logged): which log an MCP call
   * came from, and where the usage of the call that opened a session starts.
   */
  calls: Map<string, number>;
}

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Claude Code transcript (`~/.claude/projects/<project>/<session>.jsonl`): every
 * `assistant` record carries the API `message.usage`. One API message is split
 * into one record per content block, each repeating the same id and usage, so
 * records are keyed by message id + request id.
 */
export function claudeTranscriptParser(): LogParser {
  const calls = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  return {
    calls,
    line(o: Obj) {
      if (o.type !== 'assistant' || !o.message) return;
      const m = o.message as Obj;
      const at = Date.parse(o.timestamp) || Date.now();
      if (typeof m.id === 'string' && !firstSeen.has(m.id)) firstSeen.set(m.id, at);
      const began = (firstSeen.get(m.id) ?? at) - 1;
      if (Array.isArray(m.content))
        for (const c of m.content)
          if (c?.type === 'tool_use' && typeof c.id === 'string' && !calls.has(c.id)) calls.set(c.id, began);
      const u = m.usage as Obj | undefined;
      if (!u || typeof m.model !== 'string' || m.model === '<synthetic>') return;
      const cacheRead = num(u.cache_read_input_tokens);
      const cacheWrite = num(u.cache_creation_input_tokens);
      const e = {
        input: num(u.input_tokens) + cacheRead + cacheWrite,
        cacheRead,
        cacheWrite,
        output: num(u.output_tokens),
      };
      return {
        key: `${m.id ?? o.uuid}:${o.requestId ?? ''}`,
        at,
        model: m.model,
        ...e,
        costUsd: typeof o.costUSD === 'number' ? o.costUSD : priceUsage(m.model, e),
      };
    },
  };
}

interface CodexTotals {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

/**
 * Codex rollout log (`~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<thread>.jsonl`).
 * Recent Codex writes a `token_usage_record` per model response, right after the
 * response (before its tool calls run). Older Codex only has `event_msg`
 * `token_count` records with the thread's running `total_token_usage`, logged
 * after the tool calls; there each call is the growth since the previous count
 * (Codex repeats a count when nothing changed). `input_tokens` includes cached
 * input and `output_tokens` includes reasoning. The model comes from `turn_context`.
 */
export function codexRolloutParser(): LogParser {
  let model = '';
  let prev: CodexTotals | undefined;
  let n = 0;
  let records = false;
  const calls = new Map<string, number>();
  const event = (key: string, at: number, d: CodexTotals): UsageEvent | undefined => {
    const e = {
      input: num(d.input_tokens),
      cacheRead: num(d.cached_input_tokens),
      cacheWrite: num(d.cache_write_input_tokens),
      output: num(d.output_tokens),
    };
    if (!e.input && !e.output) return;
    return { key, at, model, ...e, costUsd: priceUsage(model, e) };
  };
  return {
    calls,
    line(o: Obj) {
      const p = o.payload as Obj | undefined;
      if (!p) return;
      const at = Date.parse(o.timestamp) || Date.now();
      if (o.type === 'turn_context' && typeof p.model === 'string') model = p.model;
      const callId = o.type === 'response_item' && p.type === 'function_call' ? p.call_id : undefined;
      if (typeof callId === 'string' && !calls.has(callId)) calls.set(callId, at - 1);
      if (o.type === 'token_usage_record' && p.usage) {
        records = true;
        return event(`r:${p.response_id ?? n++}`, at, p.usage as CodexTotals);
      }
      const isTokenCount = o.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage;
      if (records || !isTokenCount) return;
      const t = p.info.total_token_usage as CodexTotals;
      const d = codexDelta(t, prev, p.info.last_token_usage as CodexTotals | undefined);
      if (!d) return;
      prev = t;
      return event(`c${n++}`, at, d);
    },
  };
}

/** A JSONL log read incrementally: each `read()` parses only what was appended since the last one. */
export class LogFile {
  private offset = 0;
  private partial = '';
  constructor(
    readonly file: string,
    readonly parser: LogParser,
  ) {}

  read(): UsageEvent[] {
    let size: number;
    try {
      size = fs.statSync(this.file).size;
    } catch {
      return [];
    }
    if (size < this.offset) {
      this.offset = 0;
      this.partial = '';
    }
    if (size === this.offset) return [];
    const out: UsageEvent[] = [];
    const fd = fs.openSync(this.file, 'r');
    try {
      const buf = Buffer.alloc(Math.min(size - this.offset, 4 << 20));
      while (this.offset < size) {
        const n = fs.readSync(fd, buf, 0, Math.min(buf.length, size - this.offset), this.offset);
        if (n <= 0) break;
        this.offset += n;
        const lines = (this.partial + buf.toString('utf8', 0, n)).split('\n');
        this.partial = lines.pop() ?? '';
        out.push(...this.parse(lines));
      }
    } finally {
      fs.closeSync(fd);
    }
    return out;
  }

  /** Complete lines to events; a torn or foreign line is skipped. */
  private parse(lines: string[]): UsageEvent[] {
    const out: UsageEvent[] = [];
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const e = this.parser.line(JSON.parse(l));
        if (e) out.push(e);
      } catch {
        // a torn or foreign line; skip it
      }
    }
    return out;
  }
}

/**
 * Codex reports running totals: the usage since the previous total. When the total drops,
 * the last turn's own usage is used; an unchanged total adds nothing.
 */
function codexDelta(t: CodexTotals, prev: CodexTotals | undefined, last?: CodexTotals): CodexTotals | undefined {
  if (!prev || num(t.total_tokens) > num(prev.total_tokens))
    return {
      input_tokens: num(t.input_tokens) - num(prev?.input_tokens),
      cached_input_tokens: num(t.cached_input_tokens) - num(prev?.cached_input_tokens),
      cache_write_input_tokens: num(t.cache_write_input_tokens) - num(prev?.cache_write_input_tokens),
      output_tokens: num(t.output_tokens) - num(prev?.output_tokens),
    };
  if (num(t.total_tokens) < num(prev.total_tokens) && last) return last;
  return undefined;
}

/** Parse a whole log at once (tests, one-off reads). */
export function readLog(file: string, parser: LogParser) {
  return new LogFile(file, parser).read();
}
