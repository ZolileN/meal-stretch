/**
 * Builds the engine's PriceSnapshot from current_prices for the household's shops (PRD §9.1, §10.1).
 * Per branch, branch-level and chain-wide resolved rows are combined with the §10.1 ordering.
 * Member prices are included only when the household holds that retailer's card (Offer contract:
 * "loyalty price if card held, else null"); expired specials are dropped.
 */
import { sql } from 'drizzle-orm';
import type { Offer, PriceSnapshot } from '@mealstretch/engine';
import { query, type Db } from '@/lib/db';
import { pgArray } from '@/lib/location/queries';

interface Row {
  for_branch: string | number;
  loyalty_program_id: string | null;
  product_id: string | number;
  ingredient_id: string;
  pack_qty: number;
  price_cents: number;
  member_price_cents: number | null;
  special_price_cents: number | null;
  special_ends_on: string | Date | null;
  source: Offer['source'];
  observed_at: string | Date;
}

const iso = (d: string | Date) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const isoDate = (d: string | Date) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export async function loadPriceSnapshot(
  db: Db,
  opts: { branchIds: number[]; loyalty: string[]; asOf: string },
): Promise<PriceSnapshot> {
  const ids = [...new Set(opts.branchIds)].filter(Number.isSafeInteger);
  const offers: Record<string, Offer[]> = {};
  if (ids.length === 0) return { asOf: opts.asOf, offers };
  const rows = await query<Row>(
    db,
    sql`select distinct on (b.id, cp.product_id)
          b.id as for_branch, r.loyalty_program_id, cp.product_id, cp.ingredient_id, cp.pack_qty, cp.price_cents,
          cp.member_price_cents, cp.special_price_cents, cp.special_ends_on, cp.source, cp.observed_at
        from branches b
        join retailers r on r.id = b.retailer_id
        join current_prices cp on cp.retailer_id = b.retailer_id and (cp.branch_id = b.id or cp.branch_id is null)
        where b.id = any(${pgArray(ids)}::bigint[]) and cp.ingredient_id is not null
        order by b.id, cp.product_id, cp.is_fresh desc, (case when cp.is_fresh then cp.trust else 0 end) desc,
                 cp.observed_at desc, cp.observation_id desc`,
  );
  const cards = new Set(opts.loyalty);
  for (const r of rows) {
    const endsOn = r.special_ends_on ? isoDate(r.special_ends_on) : null;
    const specialValid = r.special_price_cents !== null && (endsOn === null || endsOn >= opts.asOf);
    const offer: Offer = {
      productId: Number(r.product_id),
      branchId: Number(r.for_branch),
      packQty: Number(r.pack_qty),
      priceCents: Number(r.price_cents),
      memberPriceCents: r.member_price_cents !== null && r.loyalty_program_id && cards.has(r.loyalty_program_id) ? Number(r.member_price_cents) : null,
      specialPriceCents: specialValid ? Number(r.special_price_cents) : null,
      specialEndsOn: specialValid ? endsOn : null,
      observedAt: iso(r.observed_at),
      source: r.source,
    };
    (offers[r.ingredient_id] ??= []).push(offer);
  }
  for (const list of Object.values(offers)) list.sort((a, b) => a.branchId - b.branchId || a.productId - b.productId);
  return { asOf: opts.asOf, offers };
}

export async function productDetails(db: Db, productIds: number[]) {
  if (productIds.length === 0) return new Map<number, { name: string; brand: string | null; retailerId: string; aisleOrder: number; category: string | null }>();
  const rows = await query<{ id: string | number; name: string; brand: string | null; retailer_id: string; aisle_order: number | null; category: string | null }>(
    db,
    sql`select p.id, p.name, p.brand, p.retailer_id, c.aisle_order, c.name as category
        from products p left join product_categories c on c.id = p.category_id
        where p.id = any(${pgArray(productIds)}::bigint[])`,
  );
  return new Map(rows.map((r) => [Number(r.id), { name: r.name, brand: r.brand, retailerId: r.retailer_id, aisleOrder: r.aisle_order ?? 999, category: r.category }]));
}
