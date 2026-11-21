/** Meal actions (PLN-6…9), pantry (PLN-11, LST-4), ticks (LST-3), mark shopped (SAV-3). */
import { sql } from 'drizzle-orm';
import { reprice, type PlanRequest, type PlanResult } from '@mealstretch/engine';
import { query, type Db } from '@/lib/db';
import type { Household } from '@/lib/household';
import { track } from '@/lib/events';
import { recipeNames } from '@/lib/recipes/queries';
import { engine, engineContext, pantryOf, PlanError, saveResult, type StoredPlan } from './service';
import { cuisineOf, ideaCandidates, pickIdeas } from './ideas';

/** The request an action runs with: the stored plan + the household's current cards, never-swap list and pantry. */
async function actionRequest(db: Db, h: Household, plan: StoredPlan): Promise<PlanRequest> {
  return { ...plan.request, loyalty: h.loyalty, neverSwapProteins: h.neverSwapProteins, pantry: await pantryOf(db, h.id) };
}
const ctxFor = (db: Db, plan: StoredPlan, req: PlanRequest) => engineContext(db, req, plan.result.priceAsOf);

function assertDay(plan: StoredPlan, day: number) {
  if (!Number.isInteger(day) || day < 1 || day > plan.request.days) throw new PlanError('invalid_day', 'That day is not in this plan');
}
function assertEditable(plan: StoredPlan) {
  if (plan.status !== 'active') throw new PlanError('not_active', 'This plan can no longer be changed', 409);
}

export async function swapOptionsFor(db: Db, h: Household, plan: StoredPlan, day: number) {
  assertDay(plan, day);
  const req = await actionRequest(db, h, plan);
  const opts = engine.swapOptions(req, plan.result, day, await ctxFor(db, plan, req));
  const names = await recipeNames(db, opts.map((o) => o.recipeId));
  const current = plan.result.meals.find((m) => m.day === day);
  const proteinOf = await mainProtein(db, current?.recipeId);
  return {
    day,
    current: current ? { recipeId: current.recipeId, protein: proteinOf } : null,
    options: opts.map((o) => {
      const m = o.result.meals.find((x) => x.day === day)!;
      return { recipeId: o.recipeId, name: names.get(o.recipeId)?.name ?? o.recipeId, cookMinutes: names.get(o.recipeId)?.cookMinutes ?? 0, deltaCents: o.deltaCents, perPlateCents: m.perPlateCents };
    }),
  };
}

/**
 * Meal ideas for one day: Claude picks from our published recipes (lib/plans/ideas.ts), then the engine
 * prices each pick as if it replaced that day's supper. Nothing is saved; choosing one uses replaceMeal.
 */
export async function ideasFor(db: Db, h: Household, plan: StoredPlan, day: number, text: string) {
  assertDay(plan, day);
  const req = await actionRequest(db, h, plan);
  const candidates = await ideaCandidates(db, { exclusions: req.exclusions, inPlan: plan.result.meals.map((m) => m.recipeId) });
  if (candidates.length === 0) return { day, understood: false, options: [] };
  const { understood, recipeIds } = await pickIdeas(db, h.id, text, candidates);
  const ctx = await ctxFor(db, plan, req);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const options = [];
  for (const id of recipeIds) {
    let result: PlanResult;
    try {
      result = engine.replace(req, plan.result, day, id, ctx);
    } catch {
      continue; // e.g. not usable on this day; never shown
    }
    const meal = result.meals.find((m) => m.day === day);
    const c = byId.get(id)!;
    if (!meal || meal.recipeId !== id) continue;
    options.push({
      recipeId: id,
      name: c.name,
      cookMinutes: c.cookMinutes,
      cuisine: cuisineOf(c.tags),
      perPlateCents: meal.perPlateCents,
      deltaCents: result.totals.paidCents - plan.result.totals.paidCents,
      unpriced: result.unpriced.filter((u) => u.recipes.includes(id)).length,
    });
  }
  // Budget first: of the matching ideas, the ones that cost least extra come first (ties keep Claude's order).
  options.sort((a, b) => a.deltaCents - b.deltaCents);
  await track(db, h.id, 'ideas_requested', { understood, options: options.length });
  return { day, understood: understood && options.length > 0, options };
}

async function mainProtein(db: Db, recipeId: string | undefined): Promise<{ id: string; name: string } | null> {
  if (!recipeId) return null;
  const rows = await query<{ id: string; name: string }>(
    db,
    sql`select i.id, i.name from recipes r join ingredients i on ('protein:' || i.id) = any(r.tags) where r.id = ${recipeId} limit 1`,
  );
  return rows[0] ?? null;
}

export async function replaceMeal(db: Db, h: Household, plan: StoredPlan, day: number, recipeId: string | 'cheapest') {
  assertEditable(plan);
  assertDay(plan, day);
  const req = await actionRequest(db, h, plan);
  let result: PlanResult;
  try {
    result = engine.replace(req, plan.result, day, recipeId, await ctxFor(db, plan, req));
  } catch (e) {
    throw new PlanError('invalid_recipe', (e as Error).message);
  }
  const deltaCents = result.totals.paidCents - plan.result.totals.paidCents;
  const saved = await saveResult(db, plan, req, result);
  if (recipeId === 'cheapest') await track(db, h.id, 'meal_cheaper', { saved_cents: -deltaCents });
  else await track(db, h.id, 'meal_swapped', { delta_cents: deltaCents });
  return { plan: saved, deltaCents };
}

export async function removeMeal(db: Db, h: Household, plan: StoredPlan, day: number) {
  assertEditable(plan);
  assertDay(plan, day);
  const req = await actionRequest(db, h, plan);
  const result = engine.remove(req, plan.result, day, await ctxFor(db, plan, req));
  const saved = await saveResult(db, plan, req, result);
  await track(db, h.id, 'meal_removed');
  return { plan: saved, savedCents: plan.result.totals.paidCents - result.totals.paidCents };
}

/** LST-4: "Already have it" → pantry gets what the plan needs of that ingredient, plan re-priced. */
export async function alreadyHave(db: Db, h: Household, plan: StoredPlan, ingredientId: string) {
  assertEditable(plan);
  const lines = plan.result.basket.filter((l) => l.ingredientId === ingredientId);
  if (!lines.length) throw new PlanError('not_in_list', 'That item is not on the list');
  const needed = lines.reduce((s, l) => s + l.packs * l.packQty - l.leftoverQty, 0);
  await db.execute(
    sql`insert into pantry_items (household_id, ingredient_id, qty) values (${h.id}::uuid, ${ingredientId}, ${needed})
        on conflict (household_id, ingredient_id) do update set qty = pantry_items.qty + excluded.qty, updated_at = now()`,
  );
  const req = await actionRequest(db, h, plan);
  const result = reprice(req, plan.result, await ctxFor(db, plan, req));
  const saved = await saveResult(db, plan, req, result);
  return { plan: saved, savedCents: plan.result.totals.paidCents - result.totals.paidCents };
}

export async function setPantry(db: Db, h: Household, items: { ingredientId: string; qty: number }[]) {
  for (const it of items) {
    await db.execute(
      sql`insert into pantry_items (household_id, ingredient_id, qty) values (${h.id}::uuid, ${it.ingredientId}, ${it.qty})
          on conflict (household_id, ingredient_id) do update set qty = excluded.qty, updated_at = now()`,
    );
  }
  return pantryOf(db, h.id);
}

export const lineKey = (l: { ingredientId: string; productId: number }) => `${l.ingredientId}:${l.productId}`;
/** List lines for ingredients we can't price yet are tickable too (they're still needed for the suppers). */
export const unpricedKey = (ingredientId: string) => `unpriced:${ingredientId}`;
export const listKeys = (plan: StoredPlan) => [...plan.result.basket.map(lineKey), ...plan.result.unpriced.map((u) => unpricedKey(u.ingredientId))];

export async function getTicks(db: Db, planId: string) {
  return query<{ line_key: string; ticked: boolean; updated_at: string }>(
    db,
    sql`select line_key, ticked, updated_at from list_ticks where plan_id = ${planId}::uuid`,
  );
}

/** LST-3: batch tick updates, last write wins by client timestamp. */
export async function putTicks(db: Db, h: Household, plan: StoredPlan, lines: { key: string; ticked: boolean; at?: string }[]) {
  const valid = new Set(listKeys(plan));
  let applied = 0;
  for (const l of lines) {
    if (!valid.has(l.key)) continue;
    const at = l.at && !Number.isNaN(Date.parse(l.at)) ? new Date(Math.min(Date.parse(l.at), Date.now() + 60_000)).toISOString() : new Date().toISOString();
    const r = await query<{ plan_id: string }>(
      db,
      sql`insert into list_ticks (plan_id, line_key, ticked, updated_at) values (${plan.id}::uuid, ${l.key}, ${l.ticked}, ${at}::timestamptz)
          on conflict (plan_id, line_key) do update set ticked = excluded.ticked, updated_at = excluded.updated_at
          where list_ticks.updated_at <= excluded.updated_at
          returning plan_id`,
    );
    applied += r.length;
    if (r.length && l.ticked) await track(db, h.id, 'list_item_ticked');
  }
  const ticks = await getTicks(db, plan.id);
  const tickedCount = ticks.filter((t) => t.ticked && valid.has(t.line_key)).length;
  if (applied && tickedCount === valid.size) await track(db, h.id, 'list_completed');
  return { applied, ticks };
}

/**
 * SAV-3: mark shopped → savings_event + leftovers into pantry, in ONE statement (atomic + idempotent:
 * only an 'active' plan transitions; savings_events has unique(kind, ref_id)).
 */
export async function markShopped(db: Db, h: Household, plan: StoredPlan): Promise<{ changed: boolean }> {
  const needed = new Set(plan.result.basket.map((l) => l.ingredientId).concat(plan.result.leftovers.map((l) => l.ingredientId)));
  const left = new Map(plan.result.leftovers.map((l) => [l.ingredientId, l.qty]));
  // Ingredients the plan touched end at their leftover quantity (0 if used up).
  const pantry = [...needed].sort().map((id) => ({ ingredient_id: id, qty: left.get(id) ?? 0 }));
  const t = plan.result.totals;
  const rows = await query<{ shopped: number | string }>(
    db,
    sql`with p as (
          update plans set status = 'shopped', shopped_at = now(), updated_at = now()
          where id = ${plan.id}::uuid and household_id = ${h.id}::uuid and status = 'active'
          returning id
        ),
        ev as (
          insert into savings_events (household_id, kind, ref_id, savings_cents, specials_cents, member_cents, pack_efficiency_cents, plan_id)
          select ${h.id}::uuid, 'plan_shopped', p.id::text, ${t.savingsCents}, ${t.specialsCents}, ${t.memberCents}, ${t.packEfficiencyCents}, p.id from p
          on conflict (kind, ref_id) do nothing
          returning id
        ),
        pan as (
          insert into pantry_items (household_id, ingredient_id, qty)
          select ${h.id}::uuid, x.ingredient_id, x.qty from p, jsonb_to_recordset(${JSON.stringify(pantry)}::jsonb) as x(ingredient_id text, qty int)
          on conflict (household_id, ingredient_id) do update set qty = excluded.qty, updated_at = now()
          returning 1
        )
        select (select count(*) from p) as shopped, (select count(*) from ev) as events, (select count(*) from pan) as pantry`,
  );
  const changed = Number(rows[0]?.shopped ?? 0) > 0;
  if (changed) await track(db, h.id, 'plan_marked_shopped');
  return { changed };
}

/** SAV-3 prompt: list complete, or 48 h after the plan started. */
export function shouldPromptShopped(plan: StoredPlan, allTicked: boolean, now: Date): boolean {
  if (plan.status !== 'active') return false;
  if (allTicked && plan.result.basket.length > 0) return true;
  return now.getTime() - Date.parse(plan.createdAt) >= 48 * 3600 * 1000;
}
