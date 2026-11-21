/**
 * Regenerates packages/engine/fixtures/*.json from seed/ (the engine package can't do I/O).
 * Prices come from seed/prices.fixture.csv (FICTIONAL), with fixed branch ids:
 *   1 = Checkers, 2 = Shoprite, 3 = Pick n Pay, 4 = SPAR, and asOf = 2026-11-21.
 * Member prices are kept for every card; tests pass loyalty-filtered snapshots via fixtures/index.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { validateCsv } from '../lib/prices/csv';
import { deriveTags } from '../lib/recipes/tags';
import { loadSeedIngredients, loadSeedRecipes } from './seed-lib';

const out = 'packages/engine/fixtures';
const ingredients = loadSeedIngredients();
const cat = new Map(ingredients.map((i) => [i.id, i.category]));
writeFileSync(
  `${out}/ingredients.json`,
  JSON.stringify(
    Object.fromEntries(ingredients.map((i) => [i.id, { id: i.id, unit: i.unit, roundTo: i.roundTo, perishable: i.perishable, pantryStaple: i.pantryStaple, category: i.category }])),
    null,
    1,
  ),
);
writeFileSync(
  `${out}/recipes.json`,
  JSON.stringify(
    loadSeedRecipes().map((r) => ({
      id: r.id,
      cookMinutes: r.cookMinutes,
      tags: deriveTags(r.tags, r.ingredients.map((i) => i.id), (id) => cat.get(id)),
      published: true,
      ingredients: r.ingredients.map((i) => ({ ingredientId: i.id, qtyPerServing: i.qty, optional: i.optional ?? false })),
    })),
    null,
    1,
  ),
);
const BRANCH: Record<string, number> = { checkers: 1, shoprite: 2, pnp: 3, spar: 4 };
const LOYALTY: Record<string, string> = { checkers: 'xtra_savings', shoprite: 'xtra_savings', pnp: 'smart_shopper', spar: 'spar_rewards' };
const { rows, rejected } = validateCsv(readFileSync('seed/prices.fixture.csv', 'utf8'), new Date('2100-01-01'));
if (rejected.length) throw new Error('fixture CSV invalid');
const offers = rows.map((r, i) => ({
  ingredientId: r.ingredient_id!,
  loyaltyProgram: LOYALTY[r.retailer_id]!,
  offer: {
    productId: 1000 + i,
    branchId: BRANCH[r.retailer_id]!,
    packQty: r.pack_qty,
    priceCents: r.price_cents,
    memberPriceCents: r.member_price_cents,
    specialPriceCents: r.special_price_cents,
    specialEndsOn: r.special_ends_on,
    observedAt: `${r.observed_at}T08:00:00.000Z`,
    source: 'catalogue',
  },
}));
writeFileSync(`${out}/prices.json`, JSON.stringify({ _comment: 'FICTIONAL fixture prices (seed/prices.fixture.csv). Not real.', asOf: '2026-11-21', offers }, null, 1));
console.log(`wrote ${ingredients.length} ingredients, recipes, ${offers.length} offers`);
