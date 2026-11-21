/**
 * Admin-only: Claude drafts new recipes from a brief ("5 quick Greek suppers under 30 minutes").
 * Drafts use only ingredients from our catalogue, are validated like any recipe, and are saved
 * UNPUBLISHED: a person reviews, cook-tests and publishes them (PRD §11.2). No prices come from Claude.
 */
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { query } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { claudeTool, models, type ToolSpec } from '@/lib/claude';
import { loadIngredients } from '@/lib/recipes/queries';
import { recipeInput, saveRecipe } from './recipes';

export const CUISINES = ['south_african', 'afrikaans', 'cape_malay', 'indian', 'portuguese', 'italian', 'chinese', 'mexican', 'american', 'british', 'greek', 'middle_eastern', 'thai', 'spanish'] as const;
const FLAGS = ['no_oven', 'one_pot', 'kid_friendly', 'meat_free'] as const;
export const MAX_DRAFTS = 5;

const draftSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(300),
  cook_minutes: z.number().int().min(5).max(300),
  cuisine: z.enum(CUISINES),
  protein: z.string(),
  starch: z.string(),
  flags: z.array(z.enum(FLAGS)).max(4).default([]),
  steps: z.array(z.string().trim().min(3).max(500)).min(3).max(12),
  ingredients: z.array(z.object({ id: z.string(), qty_per_serving: z.number().int().positive().max(2000) })).min(2).max(20),
});
export const draftsSchema = z.object({ recipes: z.array(draftSchema).min(1).max(MAX_DRAFTS) }).strict();
export type Drafts = z.infer<typeof draftsSchema>;

export function draftsTool(ingredientIds: string[]): ToolSpec {
  const id = { type: 'string', enum: ingredientIds };
  return {
    name: 'save_recipe_drafts',
    description: 'Save supper recipe drafts for a South African budget meal planner. Quantities are per serving, in each ingredient\'s unit.',
    input_schema: {
      type: 'object',
      required: ['recipes'],
      properties: {
        recipes: {
          type: 'array',
          maxItems: MAX_DRAFTS,
          items: {
            type: 'object',
            required: ['name', 'description', 'cook_minutes', 'cuisine', 'protein', 'starch', 'flags', 'steps', 'ingredients'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string', description: 'one short sentence' },
              cook_minutes: { type: 'integer', minimum: 5, maximum: 300, description: 'total hands-on + cooking time, honest' },
              cuisine: { type: 'string', enum: [...CUISINES] },
              protein: { ...id, description: 'main protein ingredient id' },
              starch: { ...id, description: 'main starch ingredient id' },
              flags: { type: 'array', items: { type: 'string', enum: [...FLAGS] } },
              steps: { type: 'array', minItems: 3, maxItems: 12, items: { type: 'string' } },
              ingredients: {
                type: 'array',
                items: { type: 'object', required: ['id', 'qty_per_serving'], properties: { id, qty_per_serving: { type: 'integer', minimum: 1 } } },
              },
            },
          },
        },
      },
    },
  };
}

const SYSTEM = `You write supper recipes for a budget meal planner used by South African households from every community.
Recipes must be realistic, affordable and cookable on a home stove (mark no_oven when no oven is needed). Use ONLY the
ingredient ids provided, with integer quantities per serving in the unit shown (g, ml or unit). Typical servings: meat
100–200 g, rice 75 g dry, pasta 90 g dry, maize meal 100 g, potatoes 250 g. Include oil and salt where used. Steps are short
and clear, 3–8 of them. Give honest cook times. Never mention prices or brands. Call save_recipe_drafts once.`;

export const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'recipe';

/** Draft with Claude and save as unpublished recipes. Returns the new ids and any drafts that failed validation. */
export async function draftRecipes(db: Db, brief: string, count: number, opts: { fixtureFallback?: () => unknown } = {}) {
  const ings = await loadIngredients(db);
  const ids = Object.keys(ings).sort();
  const catalogue = ids.map((i) => `${i} (${ings[i]!.name}, ${ings[i]!.unit})`).join('\n');
  const n = Math.max(1, Math.min(MAX_DRAFTS, Math.round(count)));
  const { output } = await claudeTool({
    db,
    purpose: 'recipe_draft',
    householdId: null,
    model: models.smart(),
    system: SYSTEM,
    tool: draftsTool(ids),
    schema: draftsSchema,
    effort: 'medium',
    maxTokens: 12000,
    content: [
      { type: 'text', text: `Ingredient ids:\n${catalogue}` },
      { type: 'text', text: `Write ${n} recipe draft(s) for this brief: ${brief.slice(0, 500)}` },
    ],
    fixtureFallback: opts.fixtureFallback,
  });

  const taken = new Set((await query<{ id: string }>(db, sql`select id from recipes`)).map((r) => r.id));
  const saved: string[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const d of output.recipes.slice(0, n)) {
    const merged = new Map<string, number>();
    for (const i of d.ingredients) merged.set(i.id, (merged.get(i.id) ?? 0) + i.qty_per_serving);
    let id = slug(d.name);
    for (let k = 2; taken.has(id); k++) id = `${slug(d.name).slice(0, 56)}_${k}`;
    const parsed = recipeInput.safeParse({
      id,
      name: d.name,
      description: d.description || null,
      cookMinutes: d.cook_minutes,
      tags: [`protein:${d.protein}`, `starch:${d.starch}`, `cuisine:${d.cuisine}`, ...new Set(d.flags)],
      steps: d.steps,
      ingredients: [...merged].map(([ingredientId, qtyPerServing]) => ({ ingredientId, qtyPerServing, optional: false })),
      published: false,
    });
    const unknown = [...merged.keys(), d.protein, d.starch].filter((x) => !ings[x]);
    if (!parsed.success || unknown.length) {
      rejected.push({ name: d.name, reason: unknown.length ? `unknown ingredients: ${unknown.join(', ')}` : (parsed.error?.issues[0]?.message ?? 'invalid') });
      continue;
    }
    await saveRecipe(db, parsed.data);
    taken.add(id);
    saved.push(id);
  }
  return { saved, rejected };
}
