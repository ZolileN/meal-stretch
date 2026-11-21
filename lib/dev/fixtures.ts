/**
 * Fixed, fictional data for the /dev pages and screenshot tests (docs/THEME.md §7.6): the real
 * screens rendered with dates and prices that never change. TEST store names only.
 */
import type { ListView } from '@/lib/plans/list';
import type { PlanView } from '@/lib/plans/view';
import type { Lifetime } from '@/lib/savings';

export const DEV_TODAY = '2026-11-23';
const PLAN_ID = '00000000-0000-4000-8000-0000000000d1';

const meals: [string, string, number, number][] = [
  ['curry_mince_rice', 'Curry mince and rice', 35, 2850],
  ['chakalaka_beans_pap', 'Chakalaka beans with pap', 30, 1650],
  ['chicken_stew', 'Chicken and vegetable stew', 45, 3200],
  ['egg_fried_rice', 'Egg fried rice with cabbage', 20, 1400],
  ['samp_beans', 'Samp and beans with a tomato and onion gravy, slow cooked', 60, 1550],
  ['fish_cakes', 'Pilchard fish cakes with mash', 30, 2100],
  ['lentil_soup', 'Red lentil soup with bread', 35, 1300],
];

export const DEV_PLAN: PlanView = {
  planId: PLAN_ID,
  status: 'active',
  startDate: DEV_TODAY,
  days: 7,
  mode: 'balanced',
  totals: { paidCents: 81240, normalCents: 93040, savingsCents: 11800, specialsCents: 8400, memberCents: 3400, packEfficiencyCents: 2100, perPlateCents: 2902, items: 18 },
  budget: { budgetCents: 90000, status: 'under', remainingCents: 8760, shortfallCents: null, maxAffordableDays: null },
  savingsPct: 13,
  specialsUsed: 4,
  priceAsOf: DEV_TODAY,
  newestPriceDate: '2026-11-21',
  staleCount: 0,
  stores: [
    { branchId: 9001, name: 'TEST Checkers Somerset West', retailerName: 'Checkers', paidCents: 68940 },
    { branchId: 9002, name: 'TEST Usave Somerset West', retailerName: 'Usave', paidCents: 12300 },
  ],
  meals: meals.map(([recipeId, name, cookMinutes, perPlateCents], i) => ({
    day: i + 1,
    date: `2026-11-${23 + i}`,
    recipeId,
    name,
    cookMinutes,
    costCents: perPlateCents * 4,
    perPlateCents,
    servings: 4,
    share: i === 3 ? { fraction: '½', pack: '1 kg', ingredient: 'rice' } : null,
    imageUrl: null,
  })) as PlanView['meals'],
  unpriced: [{ ingredientId: 'fresh_coriander', name: 'Fresh coriander', recipes: ['Curry mince and rice'] }],
  listItems: 18,
  steal: {
    productId: 1,
    productName: 'TEST Chicken portions',
    pack: '2 kg',
    ingredientId: 'chicken_portions',
    retailerName: 'Checkers',
    branchId: 9001,
    specialCents: 8999,
    normalCents: 11999,
    pct: 25,
    lowestInWeeks: 8,
    endsOn: '2026-11-30',
  } as PlanView['steal'],
};

const line = (key: string, productName: string, pack: string, packs: number, unitCents: number, normalUnitCents: number, tags: ('special' | 'member' | 'stale')[] = []) => ({
  key,
  ingredientId: key,
  productName,
  pack,
  packs,
  unitCents,
  normalUnitCents,
  totalCents: packs * unitCents,
  tags,
  source: 'catalogue' as const,
  observedAt: '2026-11-21',
});

export const DEV_LIST: ListView = {
  planId: PLAN_ID,
  status: 'active',
  totalCents: 81240,
  count: 8,
  stores: [
    {
      branchId: 9001,
      name: 'TEST Checkers Somerset West',
      retailerName: 'Checkers',
      subtotalCents: 68940,
      aisles: [
        { category: 'meat', lines: [line('mince', 'TEST Beef mince', '1 kg', 1, 8999, 10999, ['special']), line('chicken', 'TEST Chicken portions', '2 kg', 1, 8999, 11999, ['special', 'member'])] },
        { category: 'produce', lines: [line('onion', 'TEST Onions', '2 kg', 1, 2499, 2499), line('cabbage', 'TEST Green cabbage', '1 each', 2, 1599, 1599)] },
        { category: 'dry', lines: [line('rice', 'TEST Long grain rice', '2 kg', 2, 3999, 4599, ['member']), line('maize', 'TEST Super maize meal', '5 kg', 1, 6499, 6499, ['stale'])] },
      ],
    },
    { branchId: 9002, name: 'TEST Usave Somerset West', retailerName: 'Usave', subtotalCents: 12300, aisles: [{ category: 'tinned', lines: [line('beans', 'TEST Baked beans', '410 g', 6, 1199, 1399, ['special'])] }] },
  ],
  staples: [{ ingredientId: 'oil', name: 'Sunflower oil', costCents: 4299 }],
  staplesSubtotalCents: 4299,
  unpriced: [{ key: 'unpriced:fresh_coriander', ingredientId: 'fresh_coriander', name: 'Fresh coriander', needed: '30 g', category: 'produce' }],
  ticks: { onion: { ticked: true, at: `${DEV_TODAY}T08:00:00.000Z` } },
};

export const DEV_SAVINGS: Lifetime = {
  totalCents: 48650,
  specialsCents: 31200,
  memberCents: 12450,
  verifiedCents: 5000,
  packEfficiencyCents: 6300,
  shoppedPlans: 4,
  verifiedReceipts: 1,
  planRatePct: 14,
};
