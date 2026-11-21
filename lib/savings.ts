/**
 * Lifetime savings (SAV-2): plans marked shopped + receipt-verified savings, never double counted.
 * Per plan, a receipt-verified amount supersedes the plan's estimate if larger (max per plan), so the
 * total only goes up. Receipts not linked to a plan count on their own. unique(kind, ref_id) stops repeats.
 */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';

export interface Lifetime {
  totalCents: number;
  specialsCents: number;
  memberCents: number;
  verifiedCents: number;
  packEfficiencyCents: number;
  shoppedPlans: number;
  verifiedReceipts: number;
}

export async function lifetimeSavings(db: Db, householdId: string): Promise<Lifetime> {
  const rows = await query<Record<string, string | number | null>>(
    db,
    sql`with ev as (select * from savings_events where household_id = ${householdId}::uuid),
        grouped as (
          select coalesce(plan_id::text, 'receipt:' || ref_id) as k,
                 coalesce(max(savings_cents) filter (where kind = 'plan_shopped'), 0) as est,
                 coalesce(sum(savings_cents) filter (where kind = 'receipt_verified'), 0) as ver
          from ev group by 1
        )
        select
          (select coalesce(sum(greatest(est, ver)), 0) from grouped) as total,
          (select coalesce(sum(specials_cents), 0) from ev where kind = 'plan_shopped') as specials,
          (select coalesce(sum(member_cents), 0) from ev where kind = 'plan_shopped') as member,
          (select coalesce(sum(savings_cents), 0) from ev where kind = 'receipt_verified') as verified,
          (select coalesce(sum(pack_efficiency_cents), 0) from ev where kind = 'plan_shopped') as pack,
          (select count(*) from ev where kind = 'plan_shopped') as plans,
          (select count(*) from ev where kind = 'receipt_verified') as receipts`,
  );
  const r = rows[0] ?? {};
  return {
    totalCents: Number(r.total ?? 0),
    specialsCents: Number(r.specials ?? 0),
    memberCents: Number(r.member ?? 0),
    verifiedCents: Number(r.verified ?? 0),
    packEfficiencyCents: Number(r.pack ?? 0),
    shoppedPlans: Number(r.plans ?? 0),
    verifiedReceipts: Number(r.receipts ?? 0),
  };
}

export interface Steal {
  productId: number;
  productName: string;
  pack: string;
  ingredientId: string;
  retailerName: string;
  branchId: number;
  specialCents: number;
  normalCents: number;
  pct: number;
  lowestInWeeks: number | null;
  endsOn: string | null;
}

/**
 * SAV-4 steal of the week: the biggest % special at the household's shops on an ingredient used in
 * ≥ 5 published recipes. "Lowest in 8 weeks" only when no observation in the last 56 days was lower.
 */
export async function stealOfTheWeek(db: Db, opts: { branchIds: number[]; asOf: string }): Promise<Steal | null> {
  if (!opts.branchIds.length) return null;
  const { loadPriceSnapshot } = await import('@/lib/prices/snapshot');
  const snap = await loadPriceSnapshot(db, { branchIds: opts.branchIds, loyalty: [], asOf: opts.asOf });
  const popular = new Set(
    (
      await query<{ ingredient_id: string }>(
        db,
        sql`select ri.ingredient_id from recipe_ingredients ri join recipes r on r.id = ri.recipe_id and r.published
            join ingredients i on i.id = ri.ingredient_id and not i.pantry_staple
            group by ri.ingredient_id having count(distinct ri.recipe_id) >= 5`,
      )
    ).map((r) => r.ingredient_id),
  );
  let best: { ingredientId: string; o: (typeof snap.offers)[string][number]; pct: number } | null = null;
  for (const [ingredientId, offers] of Object.entries(snap.offers)) {
    if (!popular.has(ingredientId)) continue;
    for (const o of offers) {
      if (o.specialPriceCents === null) continue;
      const pct = (o.priceCents - o.specialPriceCents) / o.priceCents;
      if (!best || pct > best.pct || (pct === best.pct && o.productId < best.o.productId)) best = { ingredientId, o, pct };
    }
  }
  if (!best) return null;
  const [info] = await query<{ name: string; pack_qty: number; pack_unit: string; retailer_name: string; low: number | null }>(
    db,
    sql`select p.name, p.pack_qty, p.pack_unit, r.name as retailer_name,
               (select min(least(o.price_cents, coalesce(o.special_price_cents, o.price_cents)))
                  from price_observations o
                  where o.product_id = p.id and o.observed_at >= ${opts.asOf}::date - interval '56 days'
                    and o.observed_at < ${opts.asOf}::date - interval '6 days') as low
        from products p join retailers r on r.id = p.retailer_id where p.id = ${best.o.productId}`,
  );
  const { packLabel } = await import('@/lib/plans/view');
  const special = best.o.specialPriceCents!;
  return {
    productId: best.o.productId,
    productName: info?.name ?? best.ingredientId,
    pack: packLabel(Number(info?.pack_qty ?? best.o.packQty), info?.pack_unit ?? 'g'),
    ingredientId: best.ingredientId,
    retailerName: info?.retailer_name ?? '',
    branchId: best.o.branchId,
    specialCents: special,
    normalCents: best.o.priceCents,
    pct: Math.round(best.pct * 100),
    lowestInWeeks: info && info.low !== null && special <= Number(info.low) ? 8 : null,
    endsOn: best.o.specialEndsOn,
  };
}
