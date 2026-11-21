/** ADM-6 price health: stale prices by retailer, coverage % of published recipe ingredients per retailer. */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';

export async function priceHealth(db: Db) {
  const rows = await query<{ id: string; name: string; prices: number; stale: number; covered: number; needed: number; newest: string | null }>(
    db,
    sql`with need as (
          select distinct ri.ingredient_id from recipe_ingredients ri
          join recipes r on r.id = ri.recipe_id and r.published
          join ingredients i on i.id = ri.ingredient_id and not i.pantry_staple
        )
        select r.id, r.name,
          (select count(*)::int from current_prices cp where cp.retailer_id = r.id) as prices,
          (select count(*)::int from current_prices cp where cp.retailer_id = r.id and not cp.is_fresh) as stale,
          (select count(distinct cp.ingredient_id)::int from current_prices cp where cp.retailer_id = r.id and cp.ingredient_id in (select ingredient_id from need)) as covered,
          (select count(*)::int from need) as needed,
          (select max(observed_at) from price_observations o where o.retailer_id = r.id) as newest
        from retailers r where r.active order by r.name`,
  );
  return rows.map((r) => ({
    retailerId: r.id,
    name: r.name,
    prices: Number(r.prices),
    stale: Number(r.stale),
    coveragePct: Number(r.needed) ? Math.round((Number(r.covered) / Number(r.needed)) * 100) : 0,
    newest: r.newest ? new Date(r.newest).toISOString().slice(0, 10) : null,
  }));
}
