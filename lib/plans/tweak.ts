/**
 * PLN-13 natural-language tweak: text → Claude (fast model) → Zod-validated PlanRequest patch → engine re-run.
 * Claude only returns constraints; it never returns prices, totals or recipes (§9.8).
 */
import { z } from 'zod';
import type { PlanRequest } from '@mealstretch/engine';
import type { Db } from '@/lib/db';
import { claudeTool, models, type ToolSpec } from '@/lib/claude';
import { EXCLUSION_TAGS } from '@/lib/recipes/tags';

export const TWEAK_TOOL: ToolSpec = {
  name: 'set_plan_changes',
  description: 'Record how the household wants to change their supper plan. Only fill fields the text asks to change.',
  input_schema: {
    type: 'object',
    required: ['understood'],
    properties: {
      understood: { type: 'boolean', description: 'false if the text is not a request to change the supper plan' },
      add_exclusions: { type: 'array', items: { enum: [...EXCLUSION_TAGS] }, description: 'foods to avoid in this plan' },
      remove_exclusions: { type: 'array', items: { enum: [...EXCLUSION_TAGS] } },
      max_cook_minutes: { type: ['integer', 'null'], minimum: 10, maximum: 240, description: 'maximum cooking time; "quick"/"quicker" means 30' },
      clear_max_cook: { type: 'boolean' },
      mode: { type: ['string', 'null'], enum: ['balanced', 'cheapest', null], description: 'cheapest when they want to spend less' },
      days: { type: ['integer', 'null'], minimum: 3, maximum: 14 },
    },
  },
};

export const tweakSchema = z
  .object({
    understood: z.boolean(),
    add_exclusions: z.array(z.enum(EXCLUSION_TAGS)).max(6).optional().default([]),
    remove_exclusions: z.array(z.enum(EXCLUSION_TAGS)).max(6).optional().default([]),
    max_cook_minutes: z.number().int().min(10).max(240).nullable().optional().default(null),
    clear_max_cook: z.boolean().optional().default(false),
    mode: z.enum(['balanced', 'cheapest']).nullable().optional().default(null),
    days: z.number().int().min(3).max(14).nullable().optional().default(null),
  })
  .strict();
export type TweakPatch = z.infer<typeof tweakSchema>;

const SYSTEM = `You turn a South African household's message about their supper plan into plan changes by calling
set_plan_changes once. Messages may be in English, isiXhosa or Afrikaans. Only include changes the message asks for.
"quick"/"quicker" means max_cook_minutes 30. "cheaper"/"save more" means mode cheapest. Never suggest recipes or prices.`;

/** Fixture-mode stand-in when there is no API key (deterministic keyword rules). */
export function keywordTweak(text: string): TweakPatch {
  const s = text.toLowerCase();
  const patch: TweakPatch = { understood: false, add_exclusions: [], remove_exclusions: [], max_cook_minutes: null, clear_max_cook: false, mode: null, days: null };
  for (const ex of EXCLUSION_TAGS) {
    if (new RegExp(`\\b(no|without|avoid|skip|not)\\b[^.]{0,20}\\b${ex}`).test(s)) patch.add_exclusions.push(ex);
    else if (new RegExp(`\\b(add|bring back|allow)\\b[^.]{0,20}\\b${ex}`).test(s)) patch.remove_exclusions.push(ex);
  }
  const mins = /under (\d{2,3}) ?min/.exec(s);
  if (mins) patch.max_cook_minutes = Math.min(240, Math.max(10, Number(mins[1])));
  else if (/\b(quick|quicker|faster|less time)\b/.test(s)) patch.max_cook_minutes = 30;
  if (/\b(cheap|cheaper|save more|tight|less money)\b/.test(s)) patch.mode = 'cheapest';
  const days = /\b(\d{1,2}) (days|suppers|nights)\b/.exec(s);
  if (days && Number(days[1]) >= 3 && Number(days[1]) <= 14) patch.days = Number(days[1]);
  patch.understood = patch.add_exclusions.length + patch.remove_exclusions.length > 0 || patch.max_cook_minutes !== null || patch.mode !== null || patch.days !== null;
  return patch;
}

export async function parseTweak(db: Db, householdId: string, text: string) {
  return claudeTool({
    db,
    purpose: 'tweak',
    householdId,
    model: models.fast(),
    system: SYSTEM,
    tool: TWEAK_TOOL,
    schema: tweakSchema,
    effort: 'low',
    maxTokens: 2000,
    content: [{ type: 'text', text: text.slice(0, 500) }],
    fixtureFallback: () => keywordTweak(text),
  });
}

/** Apply a validated patch to a request (pure). Exclusions here are for this plan only. */
export function applyTweak(req: PlanRequest, p: TweakPatch): PlanRequest {
  const ex = new Set(req.exclusions);
  for (const e of p.add_exclusions) ex.add(e);
  for (const e of p.remove_exclusions) ex.delete(e);
  return {
    ...req,
    exclusions: [...ex].sort(),
    maxCookMinutes: p.clear_max_cook ? null : (p.max_cook_minutes ?? req.maxCookMinutes),
    mode: p.mode ?? req.mode,
    days: p.days ?? req.days,
    pinned: [],
  };
}
