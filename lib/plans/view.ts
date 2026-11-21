/** Server-side view model for the plan (P1) and list (L1) screens: names, stores, aisles, hints. */
import { sql } from 'drizzle-orm';
import { scaleQty, servingsHundredths, type PlanResult } from '@mealstretch/engine';
import { query, type Db } from '@/lib/db';
import { pgArray } from '@/lib/location/queries';
import { productDetails } from '@/lib/prices/snapshot';
import { loadIngredients, recipeNames } from '@/lib/recipes/queries';
import type { StoredPlan } from './service';
import { stealOfTheWeek } from '@/lib/savings';

export interface PlanView {
  planId: string;
  status: StoredPlan['status'];
  startDate: string;
  days: number;
  mode: 'balanced' | 'cheapest';
  totals: PlanResult['totals'];
  budget: PlanResult['budget'];
  savingsPct: number;
  specialsUsed: number;
  priceAsOf: string;
  newestPriceDate: string | null;
  staleCount: number;
  stores: { branchId: number; name: string; retailerName: string; paidCents: number }[];
  meals: {
    day: number;
    date: string;
    recipeId: string;
    name: string;
    cookMinutes: number;
    costCents: number;
    perPlateCents: number;
    servings: number;
    share: { fraction: string; pack: string; ingredient: string } | null;
    /** Optional decorative photo (≤ 40 KB WebP); null for most recipes. */
    imageUrl: string | null;
  }[];
  unpriced: { ingredientId: string; name: string; recipes: string[] }[];
  listItems: number;
  steal: import('@/lib/savings').Steal | null;
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'],
];
function fractionLabel(x: number): string | null {
  if (x >= 0.95 || x <= 0.1) return null;
  let best = FRACTIONS[0]!;
  for (const f of FRACTIONS) if (Math.abs(f[0] - x) < Math.abs(best[0] - x)) best = f;
  return best[1];
}
export function packLabel(qty: number, unit: string): string {
  if (unit === 'g') return qty >= 1000 ? `${qty % 1000 === 0 ? qty / 1000 : (qty / 1000).toFixed(1)} kg` : `${qty} g`;
  if (unit === 'ml') return qty >= 1000 ? `${qty % 1000 === 0 ? qty / 1000 : (qty / 1000).toFixed(1)} L` : `${qty} ml`;
  return `${qty}`;
}

export async function branchNames(db: Db, ids: number[]) {
  if (!ids.length) return new Map<number, { name: string; retailerName: string; retailerId: string }>();
  const rows = await query<{ id: string | number; name: string; retailer_name: string; retailer_id: string }>(
    db,
    sql`select b.id, b.name, r.name as retailer_name, r.id as retailer_id from branches b join retailers r on r.id = b.retailer_id
        where b.id = any(${pgArray(ids)}::bigint[])`,
  );
  return new Map(rows.map((r) => [Number(r.id), { name: r.name, retailerName: r.retailer_name, retailerId: r.retailer_id }]));
}

export async function buildPlanView(db: Db, plan: StoredPlan, language = 'en'): Promise<PlanView> {
  const r = plan.result;
  const [names, ingredients, branches] = await Promise.all([
    recipeNames(db, r.meals.map((m) => m.recipeId), language),
    loadIngredients(db),
    branchNames(db, [...new Set(r.basket.map((l) => l.branchId).concat(plan.request.shops.mainBranchId))]),
  ]);
  const recipeRows = r.meals.length
    ? await query<{ recipe_id: string; ingredient_id: string; qty_per_serving: number }>(
        db,
        sql`select recipe_id, ingredient_id, qty_per_serving from recipe_ingredients where recipe_id in (${sql.join(r.meals.map((m) => sql`${m.recipeId}`), sql`, `)})`,
      )
    : [];
  const servH = servingsHundredths(plan.request.household);
  const byStore = new Map<number, number>();
  for (const l of r.basket) byStore.set(l.branchId, (byStore.get(l.branchId) ?? 0) + l.packs * l.unitCents);
  const lineByIng = new Map<string, { packQty: number; packs: number }>();
  for (const l of r.basket) {
    const cur = lineByIng.get(l.ingredientId);
    if (!cur || l.packQty > cur.packQty) lineByIng.set(l.ingredientId, { packQty: l.packQty, packs: l.packs });
  }
  const { observedAt } = await newestObservation(db, r);

  const meals = r.meals.map((m) => {
    let share: PlanView['meals'][number]['share'] = null;
    if (m.sharesWith.length) {
      // Pack-sharing hint on the meal's main protein, e.g. "uses ½ the 1 kg mince".
      const rows = recipeRows.filter((x) => x.recipe_id === m.recipeId);
      const ranked = rows
        .map((x) => ({ x, ing: ingredients[x.ingredient_id], line: lineByIng.get(x.ingredient_id) }))
        .filter((o) => o.ing && o.line && !o.ing.pantryStaple && o.line.packs === 1)
        .sort((a, b) => Number(b.ing!.category === 'meat' || b.ing!.category === 'fish') - Number(a.ing!.category === 'meat' || a.ing!.category === 'fish'));
      for (const o of ranked) {
        const used = scaleQty(Number(o.x.qty_per_serving), servH, o.ing!.roundTo);
        const f = fractionLabel(used / o.line!.packQty);
        if (f) {
          share = { fraction: f, pack: packLabel(o.line!.packQty, o.ing!.unit), ingredient: o.ing!.name.toLowerCase() };
          break;
        }
      }
    }
    const n = names.get(m.recipeId);
    return { ...m, name: n?.name ?? m.recipeId, cookMinutes: n?.cookMinutes ?? 0, imageUrl: n?.imageUrl ?? null, share };
  });

  const recipeName = (id: string) => names.get(id)?.name ?? id;
  return {
    planId: plan.id,
    status: plan.status,
    startDate: plan.startDate,
    days: plan.request.days,
    mode: plan.request.mode,
    totals: r.totals,
    budget: r.budget,
    savingsPct: r.totals.normalCents ? Math.round((r.totals.savingsCents / r.totals.normalCents) * 100) : 0,
    specialsUsed: r.specialsUsed,
    priceAsOf: r.priceAsOf,
    newestPriceDate: observedAt,
    staleCount: r.basket.filter((l) => l.tags.includes('stale')).length,
    stores: [...byStore].map(([branchId, paidCents]) => ({
      branchId,
      paidCents,
      name: branches.get(branchId)?.name ?? '',
      retailerName: branches.get(branchId)?.retailerName ?? '',
    })),
    meals,
    unpriced: r.unpriced.map((u) => ({
      ingredientId: u.ingredientId,
      name: (ingredients[u.ingredientId] as { name?: string } | undefined)?.name ?? u.ingredientId,
      recipes: u.recipes.map(recipeName),
    })),
    listItems: r.totals.items + r.unpriced.length, // unpriced ingredients are still on the list
    steal: await stealOfTheWeek(db, { branchIds: [plan.request.shops.mainBranchId, ...(plan.request.shops.topUpBranchId ? [plan.request.shops.topUpBranchId] : [])], asOf: r.priceAsOf }).catch(() => null),
  };
}

async function newestObservation(db: Db, r: PlanResult): Promise<{ observedAt: string | null }> {
  const ids = [...new Set(r.basket.map((l) => l.productId))];
  if (!ids.length) return { observedAt: null };
  const rows = await query<{ d: string | Date | null }>(
    db,
    sql`select max(observed_at) as d from current_prices where product_id = any(${pgArray(ids)}::bigint[])`,
  );
  const d = rows[0]?.d;
  return { observedAt: d ? new Date(d).toISOString().slice(0, 10) : null };
}

export { productDetails };
