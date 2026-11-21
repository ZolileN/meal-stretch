/** Writes validated price rows: products (+ aliases) upserted, observations appended, current_prices refreshed. */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import { normName } from '@/lib/location/normalize';
import type { PriceSource } from '@/db/schema';
import type { CsvRow, RejectedRow } from './csv';

export interface ImportResult {
  batchId: number;
  accepted: number;
  rejected: RejectedRow[];
  productsCreated: number;
  observationsCreated: number;
}

export function productAlias(name: string, brand: string | null): string {
  return normName([brand, name].filter(Boolean).join(' '));
}

export async function importPriceRows(
  db: Db,
  rows: (CsvRow & { line: number })[],
  opts: { source: PriceSource; kind?: 'csv' | 'leaflet' | 'manual' | 'catalogue'; uploadedBy?: string | null; shiftDays?: number; refresh?: boolean },
): Promise<ImportResult> {
  const rejected: RejectedRow[] = [];
  const [batch] = await query<{ id: string | number }>(
    db,
    sql`insert into ingest_batches (kind, status, uploaded_by) values (${opts.kind ?? 'csv'}, 'processing', ${opts.uploadedBy ?? null}::uuid) returning id`,
  );
  const batchId = Number(batch!.id);

  const retailers = new Set((await query<{ id: string }>(db, sql`select id from retailers`)).map((r) => r.id));
  const ingredients = new Map(
    (await query<{ id: string; unit: string; category: string }>(db, sql`select id, unit, category from ingredients`)).map((i) => [i.id, i]),
  );
  const branches = new Map(
    (await query<{ id: string | number; retailer_id: string }>(db, sql`select id, retailer_id from branches`)).map((b) => [Number(b.id), b.retailer_id]),
  );

  let productsCreated = 0;
  let observationsCreated = 0;
  let accepted = 0;
  const shiftMs = (opts.shiftDays ?? 0) * 86_400_000;
  const shiftDate = (d: string) => new Date(new Date(d).getTime() + shiftMs).toISOString();

  for (const r of rows) {
    const reasons: string[] = [];
    if (!retailers.has(r.retailer_id)) reasons.push(`retailer_id: unknown retailer "${r.retailer_id}"`);
    if (r.branch_id !== null && branches.get(r.branch_id) !== r.retailer_id) reasons.push('branch_id: not a branch of this retailer');
    const ing = r.ingredient_id ? ingredients.get(r.ingredient_id) : undefined;
    if (r.ingredient_id && !ing) reasons.push(`ingredient_id: unknown ingredient "${r.ingredient_id}"`);
    if (ing && ing.unit !== r.pack_unit) reasons.push(`pack_unit: ${r.pack_unit} does not match ingredient unit ${ing.unit}`);
    if (reasons.length) {
      rejected.push({ line: r.line, reasons });
      continue;
    }
    const [prod] = await query<{ id: string | number; created: boolean }>(
      db,
      sql`insert into products (retailer_id, ingredient_id, name, brand, pack_qty, pack_unit, category_id)
          values (${r.retailer_id}, ${r.ingredient_id}, ${r.product_name}, ${r.brand}, ${r.pack_qty}, ${r.pack_unit},
                  (select id from product_categories where name = ${ing?.category ?? null}))
          on conflict (retailer_id, lower(name), coalesce(lower(brand), ''), pack_qty, pack_unit)
          do update set ingredient_id = coalesce(excluded.ingredient_id, products.ingredient_id),
                        category_id = coalesce(excluded.category_id, products.category_id), active = true
          returning id, (xmax = 0) as created`,
    );
    const productId = Number(prod!.id);
    if (prod!.created === true || String(prod!.created) === 't') productsCreated++;
    await db.execute(
      sql`insert into product_aliases (product_id, alias_norm, source) values (${productId}, ${productAlias(r.product_name, r.brand)}, ${opts.source})
          on conflict (product_id, alias_norm) do nothing`,
    );
    const observedAt = shiftDate(r.observed_at);
    const endsOn = r.special_ends_on ? shiftDate(r.special_ends_on).slice(0, 10) : null;
    const ins = await query<{ id: string | number }>(
      db,
      sql`insert into price_observations (product_id, branch_id, retailer_id, price_cents, member_price_cents, special_price_cents,
                                          special_ends_on, source, observed_at, ingest_batch_id)
          select ${productId}, ${r.branch_id}, ${r.retailer_id}, ${r.price_cents}, ${r.member_price_cents}, ${r.special_price_cents},
                 ${endsOn}::date, ${opts.source}, ${observedAt}::timestamptz, ${batchId}
          where not exists (
            select 1 from price_observations o
            where o.product_id = ${productId} and o.branch_id is not distinct from ${r.branch_id}::bigint and o.source = ${opts.source}
              and o.observed_at = ${observedAt}::timestamptz and o.price_cents = ${r.price_cents}
              and o.member_price_cents is not distinct from ${r.member_price_cents}::int
              and o.special_price_cents is not distinct from ${r.special_price_cents}::int)
          returning id`,
    );
    observationsCreated += ins.length;
    accepted++;
  }
  await db.execute(
    sql`update ingest_batches set status = 'published', raw = ${JSON.stringify({ accepted, rejected: rejected.length })}::jsonb where id = ${batchId}`,
  );
  if (opts.refresh !== false) await refreshCurrentPrices(db);
  return { batchId, accepted, rejected, productsCreated, observationsCreated };
}

export async function refreshCurrentPrices(db: Db) {
  await db.execute(sql`select refresh_current_prices()`);
}
