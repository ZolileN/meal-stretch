import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { refreshCurrentPrices, importPriceRows } from '@/lib/prices/import';
import { loadPriceSnapshot } from '@/lib/prices/snapshot';
import { validateCsv } from '@/lib/prices/csv';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let branchA: number; // checkers, gets branch-level receipts
let branchB: number; // another checkers branch: chain-wide rows only
const today = new Date().toISOString().slice(0, 10);

async function product(ingredientId: string) {
  await pg.query(
    `insert into ingredients (id, name, unit, round_to, category) values ($1, $1, 'g', 50, 'dry') on conflict do nothing`,
    [ingredientId],
  );
  const r = await pg.query<{ id: number }>(
    `insert into products (retailer_id, ingredient_id, name, pack_qty, pack_unit) values ('checkers', $1, $1, 1000, 'g') returning id`,
    [ingredientId],
  );
  return Number(r.rows[0]!.id);
}
async function obs(productId: number, cents: number, source: string, daysAgo: number, branchId: number | null = null, extra: { member?: number; special?: number; endsInDays?: number } = {}) {
  await pg.query(
    `insert into price_observations (product_id, branch_id, retailer_id, price_cents, member_price_cents, special_price_cents, special_ends_on, source, observed_at)
     values ($1, $2, 'checkers', $3, $4, $5, case when $6::int is null then null else (current_date + $6::int) end, $7, now() - make_interval(days => $8))`,
    [productId, branchId, cents, extra.member ?? null, extra.special ?? null, extra.endsInDays ?? null, source, daysAgo],
  );
}
const offerFor = async (ingredientId: string, branchId: number, loyalty: string[] = []) =>
  (await loadPriceSnapshot(db, { branchIds: [branchId], loyalty, asOf: today })).offers[ingredientId] ?? [];

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  const b = await pg.query<{ id: number }>(`select id from branches where retailer_id = 'checkers' order by id limit 2`);
  branchA = Number(b.rows[0]!.id);
  branchB = Number(b.rows[1]!.id);

  const x = await product('res_receipt_vs_leaflet');
  await obs(x, 5000, 'leaflet', 1);
  await obs(x, 4800, 'receipt', 3, branchA);
  const y = await product('res_fresh_beats_stale');
  await obs(y, 4000, 'receipt', 10, branchA);
  await obs(y, 4500, 'leaflet', 2);
  const z = await product('res_stale');
  await obs(z, 3000, 'catalogue', 8);
  const w = await product('res_excluded');
  await obs(w, 2000, 'catalogue', 22);
  const e = await product('res_trust_within_7');
  await obs(e, 1000, 'catalogue', 1);
  await obs(e, 1100, 'leaflet', 5);
  const f = await product('res_both_stale');
  await obs(f, 900, 'receipt', 15);
  await obs(f, 950, 'catalogue', 10);
  const m = await product('res_member_special');
  await obs(m, 6000, 'leaflet', 1, null, { member: 5000, special: 5500, endsInDays: 3 });
  const s = await product('res_expired_special');
  await obs(s, 6000, 'leaflet', 1, null, { special: 5000, endsInDays: -1 });
  await refreshCurrentPrices(db);
});

describe('current_prices resolution rule (§10.1)', () => {
  it('a fresh receipt beats an older leaflet at that branch; other branches get the leaflet', async () => {
    expect((await offerFor('res_receipt_vs_leaflet', branchA))[0]).toMatchObject({ priceCents: 4800, source: 'receipt', branchId: branchA });
    expect((await offerFor('res_receipt_vs_leaflet', branchB))[0]).toMatchObject({ priceCents: 5000, source: 'leaflet', branchId: branchB });
  });
  it('any observation within 7 days beats a more trusted one older than 7 days', async () => {
    expect((await offerFor('res_fresh_beats_stale', branchA))[0]).toMatchObject({ priceCents: 4500, source: 'leaflet' });
  });
  it('within 7 days, the most trusted source wins over a newer, less trusted one', async () => {
    expect((await offerFor('res_trust_within_7', branchB))[0]).toMatchObject({ priceCents: 1100, source: 'leaflet' });
  });
  it('8-day-old price is used but flagged stale (is_fresh = false)', async () => {
    const [o] = await offerFor('res_stale', branchB);
    expect(o).toMatchObject({ priceCents: 3000 });
    const r = await pg.query<{ is_fresh: boolean }>(`select is_fresh from current_prices where ingredient_id = 'res_stale'`);
    expect(r.rows[0]!.is_fresh).toBe(false);
    expect(Date.now() - new Date(o!.observedAt).getTime()).toBeGreaterThan(7 * 86_400_000);
  });
  it('22-day-old price is excluded → no offer (unpriced, never estimated)', async () => {
    expect(await offerFor('res_excluded', branchB)).toEqual([]);
  });
  it('when nothing is fresh, the most recent wins regardless of source', async () => {
    expect((await offerFor('res_both_stale', branchB))[0]).toMatchObject({ priceCents: 950, source: 'catalogue' });
  });
  it('member price only when the card is held; expired specials dropped', async () => {
    expect((await offerFor('res_member_special', branchB))[0]).toMatchObject({ memberPriceCents: null, specialPriceCents: 5500 });
    expect((await offerFor('res_member_special', branchB, ['xtra_savings']))[0]).toMatchObject({ memberPriceCents: 5000 });
    expect((await offerFor('res_member_special', branchB, ['smart_shopper']))[0]).toMatchObject({ memberPriceCents: null });
    expect((await offerFor('res_expired_special', branchB))[0]).toMatchObject({ specialPriceCents: null, specialEndsOn: null });
  });
});

describe('fixture prices + importer', () => {
  it('snapshot covers fixture ingredients at a TEST Checkers branch with source + date on every offer', async () => {
    const snap = await loadPriceSnapshot(db, { branchIds: [branchA], loyalty: [], asOf: today });
    expect(Object.keys(snap.offers).length).toBeGreaterThanOrEqual(55);
    for (const list of Object.values(snap.offers)) for (const o of list!) {
      expect(o.source).toBeTruthy();
      expect(o.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Number.isInteger(o.priceCents)).toBe(true);
    }
  });
  it('SPAR fixture: chicken feet only has a >21-day row → unpriced; butternut is stale', async () => {
    const b = await pg.query<{ id: number }>(`select id from branches where retailer_id = 'spar' limit 1`);
    const snap = await loadPriceSnapshot(db, { branchIds: [Number(b.rows[0]!.id)], loyalty: [], asOf: today });
    expect(snap.offers.chicken_feet).toBeUndefined();
    expect(snap.offers.soya_mince).toBeUndefined();
    const butternut = snap.offers.butternut?.[0];
    expect(Date.now() - new Date(butternut!.observedAt).getTime()).toBeGreaterThan(7 * 86_400_000);
  });
  it('DB-level validation rejects unknown ingredients, unit mismatches and foreign branches', async () => {
    const H = 'retailer_id,branch_id,product_name,brand,pack_qty,pack_unit,ingredient_id,price_cents,member_price_cents,special_price_cents,special_ends_on,observed_at';
    const spar = await pg.query<{ id: number }>(`select id from branches where retailer_id = 'spar' limit 1`);
    const { rows } = validateCsv(
      [
        H,
        `checkers,,Imported Rice,X,1,kg,rice,2599,,,,${today}`,
        `checkers,,Mystery,X,1,kg,unicorn_meat,2599,,,,${today}`,
        `checkers,,Milk By Weight,X,1,kg,milk,2599,,,,${today}`,
        `checkers,${spar.rows[0]!.id},Rice,X,1,kg,rice,2599,,,,${today}`,
        `nobody,,Rice,X,1,kg,rice,2599,,,,${today}`,
      ].join('\n'),
    );
    const res = await importPriceRows(db, rows, { source: 'manual' });
    expect(res.accepted).toBe(1);
    expect(res.productsCreated).toBe(1);
    expect(res.rejected.map((r) => r.line)).toEqual([3, 4, 5, 6]);
    expect(res.rejected[0]!.reasons.join()).toMatch(/unknown ingredient/);
    expect(res.rejected[1]!.reasons.join()).toMatch(/does not match ingredient unit/);
    expect(res.rejected[2]!.reasons.join()).toMatch(/not a branch of this retailer/);
    expect(res.rejected[3]!.reasons.join()).toMatch(/unknown retailer/);
    const again = await importPriceRows(db, rows, { source: 'manual' });
    expect(again.productsCreated).toBe(0);
    expect(again.observationsCreated).toBe(0);
  });
});
