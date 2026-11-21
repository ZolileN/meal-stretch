/** Plan orchestration: household + shops + current_prices → PriceSnapshot → engine → stored plan (§13). */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { createEngine, type EngineContext, type PlanRequest, type PlanResult } from '@mealstretch/engine';
import { query, type Db } from '@/lib/db';
import { updateHousehold, type Household } from '@/lib/household';
import { isoDateInSA, periodDays } from '@/lib/period';
import { loadPriceSnapshot } from '@/lib/prices/snapshot';
import { loadIngredients, loadPublishedRecipes } from '@/lib/recipes/queries';
import { EXCLUSION_TAGS } from '@/lib/recipes/tags';
import { track } from '@/lib/events';
import { log } from '@/lib/log';

export const engine = createEngine();

const loyaltyId = z.string().regex(/^[a-z_]{2,30}$/);
export const planInputSchema = z
  .object({
    household: z
      .object({ light: z.number().int().min(0).max(12), average: z.number().int().min(0).max(12), big: z.number().int().min(0).max(12) })
      .refine((h) => h.light + h.average + h.big >= 1 && h.light + h.average + h.big <= 12, 'between 1 and 12 people')
      .optional(),
    shops: z.object({ mainBranchId: z.number().int().positive(), topUpBranchId: z.number().int().positive().nullable() }).optional(),
    loyalty: z.array(loyaltyId).max(10).optional(),
    exclusions: z.array(z.enum(EXCLUSION_TAGS)).max(6).optional(),
    days: z.number().int().min(3).max(14).optional(),
    period: z
      .discriminatedUnion('kind', [
        z.object({ kind: z.literal('week') }),
        z.object({ kind: z.literal('payday') }),
        z.object({ kind: z.literal('monthEnd') }),
        z.object({ kind: z.literal('date'), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      ])
      .optional(),
    /** ONB-4: integer rands */
    budgetRands: z.number().int().min(0).max(100_000).nullable().optional(),
    mode: z.enum(['balanced', 'cheapest']).optional(),
    maxCookMinutes: z.number().int().min(10).max(240).nullable().optional(),
    /** Re-run an existing plan's request (e.g. "Fit my budget") with these overrides. */
    fromPlanId: z.string().uuid().optional(),
  })
  .strict();
export type PlanInput = z.infer<typeof planInputSchema>;

export class PlanError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

// Small in-process cache: recipes/ingredients change rarely (admin edits bust it).
let catalogue: { at: number; value: Promise<Pick<EngineContext, 'recipes' | 'ingredients'>> } | null = null;
export function invalidateCatalogue() {
  catalogue = null;
}
async function loadCatalogue(db: Db) {
  if (!catalogue || Date.now() - catalogue.at > 60_000) {
    catalogue = { at: Date.now(), value: Promise.all([loadPublishedRecipes(db), loadIngredients(db)]).then(([recipes, ingredients]) => ({ recipes, ingredients })) };
    catalogue.value.catch(() => (catalogue = null));
  }
  return catalogue.value;
}

export async function engineContext(db: Db, req: PlanRequest, asOf: string): Promise<EngineContext> {
  const branchIds = [req.shops.mainBranchId, ...(req.shops.topUpBranchId ? [req.shops.topUpBranchId] : [])];
  const [cat, prices] = await Promise.all([loadCatalogue(db), loadPriceSnapshot(db, { branchIds, loyalty: req.loyalty, asOf })]);
  return { ...cat, prices };
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1;
}

export interface StoredPlan {
  id: string;
  householdId: string;
  startDate: string;
  days: number;
  request: PlanRequest;
  result: PlanResult;
  status: 'draft' | 'active' | 'shopped' | 'archived';
  createdAt: string;
  shoppedAt: string | null;
}

const mapPlan = (r: Record<string, unknown>): StoredPlan => ({
  id: String(r.id),
  householdId: String(r.household_id),
  startDate: String(r.start_date instanceof Date ? r.start_date.toISOString() : r.start_date).slice(0, 10),
  days: Number(r.days),
  request: (typeof r.request === 'string' ? JSON.parse(r.request) : r.request) as PlanRequest,
  result: (typeof r.result === 'string' ? JSON.parse(r.result) : r.result) as PlanResult,
  status: r.status as StoredPlan['status'],
  createdAt: new Date(r.created_at as string).toISOString(),
  shoppedAt: r.shopped_at ? new Date(r.shopped_at as string).toISOString() : null,
});

export async function getPlan(db: Db, householdId: string, planId: string): Promise<StoredPlan | null> {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return null;
  const rows = await query<Record<string, unknown>>(db, sql`select * from plans where id = ${planId}::uuid and household_id = ${householdId}::uuid`);
  return rows[0] ? mapPlan(rows[0]) : null;
}

export async function latestPlan(db: Db, householdId: string): Promise<StoredPlan | null> {
  const rows = await query<Record<string, unknown>>(
    db,
    sql`select * from plans where household_id = ${householdId}::uuid and status in ('active', 'shopped')
        order by created_at desc limit 1`,
  );
  return rows[0] ? mapPlan(rows[0]) : null;
}

export async function createPlan(db: Db, household: Household, input: PlanInput, now = new Date()): Promise<StoredPlan> {
  const today = isoDateInSA(now);
  let base: Partial<PlanRequest> = {};
  if (input.fromPlanId) {
    const prev = await getPlan(db, household.id, input.fromPlanId);
    if (!prev) throw new PlanError('not_found', 'Plan not found', 404);
    base = prev.request;
  }
  // Persist profile changes on the household (ONB-2/3/5, LOC-4).
  const patch: Parameters<typeof updateHousehold>[2] = {};
  if (input.household) Object.assign(patch, input.household);
  if (input.shops) Object.assign(patch, { mainBranchId: input.shops.mainBranchId, topUpBranchId: input.shops.topUpBranchId });
  if (input.loyalty) patch.loyalty = [...new Set(input.loyalty)].sort();
  if (input.exclusions) patch.exclusions = [...new Set(input.exclusions)].sort();
  const h = Object.keys(patch).length ? await updateHousehold(db, household.id, patch) : household;

  const shops = input.shops ?? base.shops ?? (h.mainBranchId ? { mainBranchId: h.mainBranchId, topUpBranchId: h.topUpBranchId } : null);
  if (!shops) throw new PlanError('no_shops', 'Choose your shops first');
  const days = input.period ? periodDays(input.period, today, h.paydayDom ?? undefined).days : (input.days ?? base.days ?? 7);
  const budgetCents =
    input.budgetRands !== undefined ? (input.budgetRands === null ? null : input.budgetRands * 100) : (base.budgetCents ?? null);
  const req: PlanRequest = {
    days,
    household: { light: h.light, average: h.average, big: h.big },
    budgetCents,
    shops,
    loyalty: h.loyalty,
    exclusions: h.exclusions,
    neverSwapProteins: h.neverSwapProteins,
    pantry: await pantryOf(db, h.id),
    pinned: [],
    blocked: base.blocked ?? [],
    mode: input.mode ?? 'balanced',
    maxCookMinutes: input.maxCookMinutes !== undefined ? input.maxCookMinutes : (base.maxCookMinutes ?? null),
    seed: base.seed ?? randomSeed(),
  };
  const ctx = await engineContext(db, req, today);
  if (ctx.recipes.length === 0) throw new PlanError('no_recipes', 'No recipes are published yet', 503);
  const t0 = performance.now();
  const result = engine.plan(req, ctx);
  const ms = Math.round(performance.now() - t0);
  log.info('plan_generated', { householdId: h.id, ms, days, recipes: ctx.recipes.length, paid: result.totals.paidCents });

  const rows = await query<Record<string, unknown>>(
    db,
    sql`with archived as (
          update plans set status = 'archived', updated_at = now()
          where household_id = ${h.id}::uuid and status = 'active'
        )
        insert into plans (household_id, start_date, days, request, result, engine_version, seed, price_as_of, status,
                           paid_cents, normal_cents, savings_cents)
        values (${h.id}::uuid, ${today}::date, ${req.days}, ${JSON.stringify(req)}::jsonb, ${JSON.stringify(result)}::jsonb,
                ${result.engineVersion}, ${req.seed}, ${result.priceAsOf}::date, 'active',
                ${result.totals.paidCents}, ${result.totals.normalCents}, ${result.totals.savingsCents})
        returning *`,
  );
  const stored = mapPlan(rows[0]!);
  const pct = result.totals.normalCents ? Math.round((result.totals.savingsCents / result.totals.normalCents) * 100) : 0;
  await track(db, h.id, 'plan_generated', { ms, paid_cents: result.totals.paidCents, savings_pct: pct, items: result.totals.items, status: result.budget.status });
  if (budgetCents !== null && input.budgetRands !== undefined) await track(db, h.id, 'budget_set', { cents: budgetCents, days, people: h.light + h.average + h.big });
  if (result.budget.status === 'over') await track(db, h.id, 'plan_over_budget', { shortfall_cents: result.budget.shortfallCents });
  return stored;
}

/** Save an updated result for an existing plan (meal actions, pantry changes). */
export async function saveResult(db: Db, plan: StoredPlan, request: PlanRequest, result: PlanResult): Promise<StoredPlan> {
  const rows = await query<Record<string, unknown>>(
    db,
    sql`update plans set request = ${JSON.stringify(request)}::jsonb, result = ${JSON.stringify(result)}::jsonb,
          paid_cents = ${result.totals.paidCents}, normal_cents = ${result.totals.normalCents}, savings_cents = ${result.totals.savingsCents},
          updated_at = now()
        where id = ${plan.id}::uuid returning *`,
  );
  return mapPlan(rows[0]!);
}

export async function pantryOf(db: Db, householdId: string): Promise<PlanRequest['pantry']> {
  const rows = await query<{ ingredient_id: string; qty: number }>(
    db,
    sql`select ingredient_id, qty from pantry_items where household_id = ${householdId}::uuid and qty > 0 order by ingredient_id`,
  );
  return rows.map((r) => ({ ingredientId: r.ingredient_id, qty: Number(r.qty) }));
}
