/** 0005 province-scoped prices: branch, province and national observations resolve per branch with the §10.1 order. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { loadPriceSnapshot } from '@/lib/prices/snapshot';
import { importPriceRows, refreshCurrentPrices } from '@/lib/prices/import';
import { validateCsv } from '@/lib/prices/csv';
import { createReviewBatch, publishBatch, reviewBatch } from '@/lib/leaflets';
import { isoDateInSA } from '@/lib/period';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let wc: number; // TEST Checkers Somerset West (WC)
let ec: number; // TEST Checkers Bluewater Bay (EC)
let product: number;
const asOf = isoDateInSA(new Date());
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function observe(o: { branch?: number | null; province?: string | null; price: number; source: string; at: string }) {
  await pg.query(
    `insert into price_observations (product_id, branch_id, province, retailer_id, price_cents, source, observed_at) values ($1, $2, $3, 'checkers', $4, $5, $6)`,
    [product, o.branch ?? null, o.province ?? null, o.price, o.source, o.at],
  );
}
async function priceAt(branch: number) {
  await refreshCurrentPrices(db);
  const snap = await loadPriceSnapshot(db, { branchIds: [branch], loyalty: [], asOf });
  return Object.values(snap.offers).flat().find((o) => o.productId === product)?.priceCents ?? null;
}

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  const id = async (name: string) => Number((await pg.query<{ id: number }>(`select id from branches where name = $1`, [name])).rows[0]!.id);
  wc = await id('TEST Checkers Somerset West');
  ec = await id('TEST Checkers Bluewater Bay');
  product = Number(
    (await pg.query<{ id: number }>(`insert into products (retailer_id, ingredient_id, name, pack_qty, pack_unit) values ('checkers', 'rice', 'TEST Province Rice 1kg', 1000, 'g') returning id`)).rows[0]!.id,
  );
});

describe('province-scoped prices', () => {
  it('a Western Cape price applies to WC branches only; the national price applies elsewhere', async () => {
    await observe({ price: 5000, source: 'leaflet', at: ago(2) });
    await observe({ province: 'WC', price: 4000, source: 'leaflet', at: ago(1) });
    expect(await priceAt(wc)).toBe(4000);
    expect(await priceAt(ec)).toBe(5000);
  });

  it('a branch\'s own fresher, more trusted price still wins (§10.1 order unchanged)', async () => {
    await observe({ branch: ec, price: 4500, source: 'receipt', at: ago(0) });
    expect(await priceAt(ec)).toBe(4500);
    expect(await priceAt(wc)).toBe(4000);
  });

  it('a price cannot be scoped to both a branch and a province, and province codes are checked', async () => {
    await expect(observe({ branch: wc, province: 'WC', price: 100, source: 'manual', at: ago(0) })).rejects.toThrow(/price_obs_one_scope/);
    await expect(observe({ province: 'XX', price: 100, source: 'manual', at: ago(0) })).rejects.toThrow();
  });

  it('CSV: optional province column; blank = national; branch + province rejected', async () => {
    const head = 'retailer_id,branch_id,province,product_name,brand,pack_qty,pack_unit,ingredient_id,price_cents,member_price_cents,special_price_cents,special_ends_on,observed_at';
    const today = asOf;
    const { rows, rejected } = validateCsv(
      [
        head,
        `checkers,,gp,TEST CSV Pasta 500g,,500,g,pasta,1500,,,,${today}`,
        `checkers,,,TEST CSV Pasta 500g,,500,g,pasta,1700,,,,${today}`,
        `checkers,,XX,TEST CSV Pasta 500g,,500,g,pasta,1600,,,,${today}`,
        `checkers,${wc},WC,TEST CSV Pasta 500g,,500,g,pasta,1600,,,,${today}`,
      ].join('\n'),
    );
    expect(rows.map((r) => r.province)).toEqual(['GP', null]);
    expect(rejected.map((r) => r.line)).toEqual([4, 5]);
    const res = await importPriceRows(db, rows, { source: 'manual' });
    expect(res.observationsCreated).toBe(2);
    const stored = await pg.query<{ province: string | null }>(
      `select o.province from price_observations o join products p on p.id = o.product_id where p.name = 'TEST CSV Pasta 500g' order by o.price_cents`,
    );
    expect(stored.rows.map((r) => r.province)).toEqual(['GP', null]);
    // Files without the column still work (all national).
    const legacy = validateCsv(`retailer_id,branch_id,product_name,brand,pack_qty,pack_unit,ingredient_id,price_cents,member_price_cents,special_price_cents,special_ends_on,observed_at\ncheckers,,TEST Legacy Rice 1kg,,1000,g,rice,2500,,,,${today}`);
    expect(legacy.rows[0]!.province).toBeNull();
  });

  it('leaflet batches carry their province onto published prices', async () => {
    const batchId = await createReviewBatch(
      db,
      'checkers',
      null,
      { document_type: 'leaflet', retailer: 'Checkers', date: asOf, valid_until: asOf, lines: [{ raw_name: 'TEST Province Rice 1kg', size_text: '1kg', price_cents: 3500 }] },
      'KZN',
    );
    const b = (await reviewBatch(db, batchId))!;
    expect(b.province).toBe('KZN');
    await publishBatch(db, batchId, [{ index: 0, action: 'approve', productId: product }]);
    const obs = await pg.query<{ province: string | null; branch_id: number | null }>(`select province, branch_id from price_observations where ingest_batch_id = $1`, [batchId]);
    expect(obs.rows).toEqual([{ province: 'KZN', branch_id: null }]);
    // Not visible to WC or EC branches.
    expect(await priceAt(wc)).toBe(4000);
  });
});
