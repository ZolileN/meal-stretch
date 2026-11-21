/**
 * Claude wrapper (PRD §9.8, §10.4, §15). The ONLY place that talks to the Anthropic API.
 *  - tool-use output, validated with Zod (Claude never returns prices/recipes shown to users as-is;
 *    callers re-compute anything that affects money)
 *  - content-hash cache in llm_calls, cost/latency logging, per-household daily caps
 *  - model IDs from env (CLAUDE_MODEL_VISION, CLAUDE_MODEL_FAST)
 *  - fixture mode without ANTHROPIC_API_KEY: recorded responses in fixtures/claude/<purpose>/<hash>.json
 *  - server-side refusal fallback ("default" routing) on models that support it
 */
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { query, type Db } from '@/lib/db';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { isoDateInSA } from '@/lib/period';

export type Purpose = 'tweak' | 'receipt' | 'leaflet' | 'recipe_draft' | 'translation';

/** Per-household daily caps (PRD §15). */
export const DAILY_CAPS: Partial<Record<Purpose, number>> = { tweak: 10, receipt: 5 };

/** Models that accept the server-side refusal fallback (skill: claude-api, 2026-11). */
const SERVER_FALLBACK = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** USD per million tokens (input, output) for cost logging only. Unknown models log null cost. */
const PRICES: Record<string, [number, number]> = {
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-opus-5-5': [4, 20],
};

export class ClaudeError extends Error {
  constructor(public code: 'unavailable' | 'cap_reached' | 'refused' | 'invalid_output' | 'api_error', message: string) {
    super(message);
    this.name = 'ClaudeError';
  }
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeCall<T> {
  db: Db;
  purpose: Purpose;
  householdId: string | null;
  model: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  tool: ToolSpec;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  /** Fixture mode only: used when no recorded fixture matches (e.g. a deterministic tweak parser). */
  fixtureFallback?: () => unknown;
}

export interface ClaudeResult<T> {
  output: T;
  cached: boolean;
  fixture: boolean;
  hash: string;
}

export function contentHash(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

const dayStartSA = (now: Date) => `${isoDateInSA(now)}T00:00:00+02:00`;

export async function usedToday(db: Db, householdId: string, purpose: Purpose, now = new Date()): Promise<number> {
  const [r] = await query<{ n: number }>(
    db,
    sql`select count(*)::int as n from llm_calls
        where household_id = ${householdId}::uuid and purpose = ${purpose} and created_at >= ${dayStartSA(now)}::timestamptz`,
  );
  return Number(r?.n ?? 0);
}

/** Throws ClaudeError('cap_reached') when the household has used today's allowance. */
export async function assertCap(db: Db, householdId: string | null, purpose: Purpose, now = new Date()) {
  const cap = DAILY_CAPS[purpose];
  if (!cap || !householdId) return;
  if ((await usedToday(db, householdId, purpose, now)) >= cap) throw new ClaudeError('cap_reached', `Daily limit of ${cap} reached`);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return client;
}

export function fixturePath(purpose: Purpose, hash: string) {
  // Fixtures are a dev/test aid (no API key). Don't let the bundler trace the whole project into the
  // server function because of this dynamic path; on Vercel the deterministic fallbacks apply instead.
  return join(resolve(/*turbopackIgnore: true*/ process.cwd(), env().CLAUDE_FIXTURE_DIR), purpose, `${hash}.json`);
}

async function logCall(db: Db, row: { householdId: string | null; purpose: Purpose; hash: string; model: string; inTok?: number; outTok?: number; ms?: number; output?: unknown; ok: boolean }) {
  const price = PRICES[row.model];
  const cost = price && row.inTok !== undefined && row.outTok !== undefined ? Math.round(row.inTok * price[0] + row.outTok * price[1]) : null;
  await db.execute(
    sql`insert into llm_calls (household_id, purpose, content_hash, model, input_tokens, output_tokens, latency_ms, cost_micro_usd, output, ok)
        values (${row.householdId}::uuid, ${row.purpose}, ${row.hash}, ${row.model}, ${row.inTok ?? null}, ${row.outTok ?? null},
                ${row.ms ?? null}, ${cost}, ${row.output === undefined ? null : JSON.stringify(row.output)}::jsonb, ${row.ok})`,
  );
}

export async function claudeTool<T>(c: ClaudeCall<T>): Promise<ClaudeResult<T>> {
  const hash = contentHash({ v: 1, model: c.model, purpose: c.purpose, system: c.system, tool: c.tool, content: c.content });

  // 1. Cache: an identical successful call is reused and doesn't count against caps.
  const [hit] = await query<{ output: unknown }>(
    c.db,
    sql`select output from llm_calls where purpose = ${c.purpose} and content_hash = ${hash} and ok and output is not null
        order by created_at desc limit 1`,
  );
  if (hit) {
    const parsed = c.schema.safeParse(typeof hit.output === 'string' ? JSON.parse(hit.output) : hit.output);
    if (parsed.success) return { output: parsed.data, cached: true, fixture: false, hash };
  }

  await assertCap(c.db, c.householdId, c.purpose);

  // 2. Fixture mode (no key): recorded responses, or a deterministic fallback.
  if (!env().ANTHROPIC_API_KEY) {
    const p = fixturePath(c.purpose, hash);
    const raw = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : c.fixtureFallback?.();
    if (raw === undefined) throw new ClaudeError('unavailable', 'Claude is not configured (no ANTHROPIC_API_KEY and no recorded fixture)');
    const parsed = c.schema.safeParse(raw);
    await logCall(c.db, { householdId: c.householdId, purpose: c.purpose, hash, model: `fixture:${c.model}`, output: parsed.success ? parsed.data : raw, ok: parsed.success });
    if (!parsed.success) throw new ClaudeError('invalid_output', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return { output: parsed.data, cached: false, fixture: true, hash };
  }

  // 3. Real call: tool use (tool_choice auto; forced choice isn't accepted on current models).
  const t0 = performance.now();
  const fallback = SERVER_FALLBACK.has(c.model);
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await anthropic().beta.messages.create({
      model: c.model,
      max_tokens: c.maxTokens ?? 16000,
      system: c.system,
      tools: [c.tool as Anthropic.Beta.BetaTool],
      tool_choice: { type: 'auto' },
      ...(c.effort ? { output_config: { effort: c.effort } } : {}),
      ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      messages: [{ role: 'user', content: c.content }],
    });
  } catch (e) {
    await logCall(c.db, { householdId: c.householdId, purpose: c.purpose, hash, model: c.model, ms: Math.round(performance.now() - t0), ok: false });
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError('api_error', 'Claude is busy. Please try again shortly.');
    if (e instanceof Anthropic.APIError) throw new ClaudeError('api_error', `Claude API error ${e.status}`);
    throw e;
  }
  const ms = Math.round(performance.now() - t0);
  const usage = { inTok: res.usage.input_tokens, outTok: res.usage.output_tokens };

  if (res.stop_reason === 'refusal') {
    await logCall(c.db, { householdId: c.householdId, purpose: c.purpose, hash, model: res.model, ms, ...usage, ok: false });
    throw new ClaudeError('refused', 'The request was declined');
  }
  const block = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === c.tool.name);
  const parsed = block ? c.schema.safeParse(block.input) : null;
  await logCall(c.db, { householdId: c.householdId, purpose: c.purpose, hash, model: res.model, ms, ...usage, output: parsed?.success ? parsed.data : block?.input, ok: Boolean(parsed?.success) });
  log.info('claude_call', { purpose: c.purpose, model: res.model, ms, ...usage, ok: Boolean(parsed?.success) });
  if (!block) throw new ClaudeError('invalid_output', `Claude did not call ${c.tool.name} (stop_reason ${res.stop_reason})`);
  if (!parsed!.success) throw new ClaudeError('invalid_output', parsed!.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return { output: parsed!.data, cached: false, fixture: false, hash };
}

export const models = {
  vision: () => env().CLAUDE_MODEL_VISION,
  fast: () => env().CLAUDE_MODEL_FAST,
};
