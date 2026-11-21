/**
 * Meal ideas: the household says what they feel like ("something Italian in 15 minutes") and Claude
 * picks matching recipes from OUR published catalogue. Claude only returns recipe ids; it never writes
 * recipes, prices or totals (CLAUDE.md money rule 5). The engine prices every pick for the household.
 */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { query, type Db } from '@/lib/db';
import { claudeTool, models, type ToolSpec } from '@/lib/claude';
import { isExcluded, tagValue } from '@/lib/recipes/tags';

export const MAX_IDEAS = 5;

export interface IdeaCandidate {
  id: string;
  name: string;
  description: string | null;
  cookMinutes: number;
  tags: string[];
}

export const cuisineOf = (tags: string[]) => tags.find((t) => t.startsWith('cuisine:'))?.slice(8) ?? null;

/** Published recipes the household could have: not excluded by their diet and not already in the plan. */
export async function ideaCandidates(db: Db, opts: { exclusions: string[]; inPlan: string[] }): Promise<IdeaCandidate[]> {
  const rows = await query<{ id: string; name: string; description: string | null; cook_minutes: number; tags: string[] }>(
    db,
    sql`select id, name, description, cook_minutes, tags from recipes where published order by id`,
  );
  const inPlan = new Set(opts.inPlan);
  return rows
    .filter((r) => !inPlan.has(r.id) && !isExcluded(r.tags, opts.exclusions))
    .map((r) => ({ id: r.id, name: r.name, description: r.description, cookMinutes: Number(r.cook_minutes), tags: r.tags }));
}

export const ideasSchema = z
  .object({
    understood: z.boolean(),
    recipe_ids: z.array(z.string().max(80)).max(MAX_IDEAS).default([]),
  })
  .strict();
export type IdeasPick = z.infer<typeof ideasSchema>;

export function ideasTool(ids: string[]): ToolSpec {
  return {
    name: 'pick_recipes',
    description: 'Return up to 5 recipe ids from the provided list that best match what the household asked for, best match first.',
    input_schema: {
      type: 'object',
      required: ['understood', 'recipe_ids'],
      properties: {
        understood: { type: 'boolean', description: 'false if the message is not about what to eat, or nothing in the list fits' },
        recipe_ids: { type: 'array', maxItems: MAX_IDEAS, items: { type: 'string', enum: ids } },
      },
    },
  };
}

const SYSTEM = `You help a South African household choose suppers. Households come from every community and enjoy
South African dishes from all cultures as well as international food. You get their message and a list of recipes
from our catalogue (id | name | minutes | cuisine | details). Call pick_recipes once with up to 5 ids from that list
that best match the message: cuisine, cooking time, ingredients, mood, who is eating, diet. Best match first.
Messages may be in English, isiXhosa or Afrikaans. Only use ids from the list. Never invent recipes, ingredients or
prices. If the message is not about food, or nothing fits, set understood to false with an empty list.`;

export function catalogueLines(c: IdeaCandidate[]): string {
  return c
    .map((r) => {
      const details = [
        tagValue(r.tags, 'protein') && `protein ${tagValue(r.tags, 'protein')!.replace(/_/g, ' ')}`,
        r.tags.includes('meat_free') && 'meat-free',
        r.tags.includes('kid_friendly') && 'kids like it',
        r.tags.includes('no_oven') ? 'no oven' : 'oven',
        r.tags.includes('one_pot') && 'one pot',
      ].filter(Boolean);
      return `${r.id} | ${r.name} | ${r.cookMinutes} min | ${(cuisineOf(r.tags) ?? 'south_african').replace(/_/g, ' ')} | ${details.join(', ')}`;
    })
    .join('\n');
}

const CUISINE_WORDS: Record<string, RegExp> = {
  italian: /\b(italian|pasta|spaghetti|pizza|macaroni|bolognaise|bolognese)\b/,
  chinese: /\b(chinese|noodles?|stir[- ]?fry|chow mein|soy)\b/,
  indian: /\b(indian|curry|curries|durban|roti|bunny|dhal|masala|breyani|biryani)\b/,
  mexican: /\b(mexican|tacos?|quesadillas?|fajitas?|burritos?|chilli)\b/,
  cape_malay: /\b(cape malay|bobotie|akhni|malay)\b/,
  afrikaans: /\b(afrikaans|boerekos|bredie|potjie|wors|frikkadels?)\b/,
  portuguese: /\b(portuguese|peri[- ]?peri|prego|trinchado)\b/,
  greek: /\b(greek|feta)\b/,
  middle_eastern: /\b(middle eastern|shawarma|shakshuka|chickpeas?|lebanese)\b/,
  thai: /\b(thai|coconut)\b/,
  american: /\b(american|burgers?|hot ?dogs?|wraps?|sloppy)\b/,
  british: /\b(british|english|fish and chips|bangers|toad in the hole)\b/,
  south_african: /\b(south african|pap|samp|chakalaka|braai|kasi|kota|vetkoek|mogodu)\b/,
};
const PROTEIN_WORDS: [RegExp, (p: string) => boolean][] = [
  [/\bchicken\b/, (p) => p.startsWith('chicken')],
  [/\b(beef|mince)\b/, (p) => p.startsWith('beef') || p === 'corned_beef_tin'],
  [/\b(fish|hake|tuna|pilchards?)\b/, (p) => ['hake_fillets', 'tuna_tin', 'pilchards_tin', 'fish_fingers'].includes(p)],
  [/\beggs?\b/, (p) => p === 'eggs'],
  [/\b(pork|sausages?|viennas|russians|polony)\b/, (p) => ['pork_chops', 'pork_sausages', 'viennas', 'russians', 'polony', 'boerewors'].includes(p)],
  [/\b(lentils?|beans?|chickpeas?)\b/, (p) => /lentil|bean|chickpea/.test(p)],
];

/** Deterministic stand-in when there is no API key (dev, tests): keyword scoring over the same candidates. */
export function keywordIdeas(text: string, candidates: IdeaCandidate[]): IdeasPick {
  const s = text.toLowerCase();
  const mins = /\b(\d{2})\s*(min|minutes)\b/.exec(s);
  const maxMinutes = mins ? Number(mins[1]) : /\b(quick|fast|quickly|easy|in a hurry|rushed)\b/.test(s) ? 30 : null;
  const meatFree = /\b(vegetarian|veggie|meat[- ]?free|no meat|without meat)\b/.test(s);
  const kids = /\b(kids?|children|child|picky)\b/.test(s);
  const noOven = /\b(no oven|without (an )?oven|stove ?top)\b/.test(s);
  const cuisines = Object.entries(CUISINE_WORDS).filter(([, re]) => re.test(s)).map(([c]) => c);
  const proteins = PROTEIN_WORDS.filter(([re]) => re.test(s)).map(([, f]) => f);
  const words = s.split(/[^a-z]+/).filter((w) => w.length > 3);

  const scored = candidates
    .filter((r) => (maxMinutes === null || r.cookMinutes <= maxMinutes) && (!meatFree || r.tags.includes('meat_free')) && (!noOven || r.tags.includes('no_oven')))
    .map((r) => {
      const protein = tagValue(r.tags, 'protein') ?? '';
      const name = r.name.toLowerCase();
      let score = 0;
      if (cuisines.includes(cuisineOf(r.tags) ?? '')) score += 3;
      if (proteins.some((f) => f(protein))) score += 3;
      if (kids && r.tags.includes('kid_friendly')) score += 2;
      if (maxMinutes !== null || meatFree || noOven) score += 1;
      score += words.filter((w) => name.includes(w)).length;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.cookMinutes - b.r.cookMinutes || (a.r.id < b.r.id ? -1 : 1));
  const recipe_ids = scored.slice(0, MAX_IDEAS).map((x) => x.r.id);
  return { understood: recipe_ids.length > 0, recipe_ids };
}

/** Ask Claude (fast model) to pick from the candidates. Returned ids are always re-checked against the list. */
export async function pickIdeas(db: Db, householdId: string, text: string, candidates: IdeaCandidate[]) {
  const ids = candidates.map((c) => c.id);
  const res = await claudeTool({
    db,
    purpose: 'ideas',
    householdId,
    model: models.fast(),
    system: SYSTEM,
    tool: ideasTool(ids),
    schema: ideasSchema,
    effort: 'low',
    maxTokens: 1000,
    content: [
      { type: 'text', text: `Recipes:\n${catalogueLines(candidates)}` },
      { type: 'text', text: `Household message: ${text.slice(0, 300)}` },
    ],
    fixtureFallback: () => keywordIdeas(text, candidates),
  });
  return sanitizePicks(res.output, ids);
}

/** Keep only ids from the candidate list, de-duplicated, best first, at most MAX_IDEAS. */
export function sanitizePicks(output: IdeasPick, allowedIds: string[]): { understood: boolean; recipeIds: string[] } {
  const allowed = new Set(allowedIds);
  const picked = [...new Set(output.recipe_ids)].filter((id) => allowed.has(id)).slice(0, MAX_IDEAS);
  return { understood: output.understood && picked.length > 0, recipeIds: picked };
}
