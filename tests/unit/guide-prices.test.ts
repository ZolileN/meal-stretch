/** seed/prices.guide.csv (web-search guide prices, MVP): valid for the importer and covers every ingredient. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateCsv } from '@/lib/prices/csv';
import { loadSeedIngredients } from '@/scripts/seed-lib';

const { rows, rejected } = validateCsv(readFileSync('seed/prices.guide.csv', 'utf8'), new Date('2100-01-01'));

describe('guide prices file', () => {
  it('every row passes the CSV validation used by the importer', () => {
    expect(rejected).toEqual([]);
    expect(rows.length).toBeGreaterThan(150);
  });
  it('every ingredient has at least one guide price (no item unpriced, owner decision)', () => {
    const covered = new Set(rows.map((r) => r.ingredient_id));
    const missing = loadSeedIngredients().map((i) => i.id).filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
  });
  it('every row says where it was found, is national and uses a known retailer', () => {
    const retailers = new Set(['checkers', 'shoprite', 'pnp', 'spar', 'woolworths', 'boxer', 'usave']);
    for (const r of rows) {
      expect(r.source_url, r.product_name).toMatch(/^https:\/\/([a-z]+\.)?(shoprite|checkers|pnp|woolworths)\.co\.za\//);
      expect(r.branch_id).toBeNull();
      expect(r.province).toBeNull();
      expect(retailers.has(r.retailer_id), r.retailer_id).toBe(true);
    }
  });
  it('pack units match the ingredient units (so quantities convert)', () => {
    const unit = new Map(loadSeedIngredients().map((i) => [i.id, i.unit]));
    for (const r of rows) expect(r.pack_unit, `${r.product_name} → ${r.ingredient_id}`).toBe(unit.get(r.ingredient_id!));
  });
});
