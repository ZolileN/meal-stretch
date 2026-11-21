/**
 * `pnpm bench:engine`: 14 days × 200 synthetic recipes, household of 4, main + top-up shop.
 * Prints p50/p95 and exits 1 if p95 ≥ 300 ms (PRD §9.5, BUILD 3.6).
 */
import { createEngine, mulberry32 } from '../src/index';
import type { EngineRecipe } from '../src/types';
import { BRANCH, context, ingredients, recipes as base, request } from '../fixtures';

const rand = mulberry32(7);
const ids = Object.keys(ingredients).filter((id) => !ingredients[id]!.pantryStaple);
const staples = Object.keys(ingredients).filter((id) => ingredients[id]!.pantryStaple);
const proteins = ids.filter((id) => ['meat', 'fish', 'tinned'].includes(ingredients[id]!.category));
const starches = ['rice', 'maize_meal', 'potatoes', 'pasta', 'samp', 'bread'];

const synthetic: EngineRecipe[] = [...base];
for (let k = synthetic.length; k < 200; k++) {
  const protein = proteins[Math.floor(rand() * proteins.length)]!;
  const starch = starches[Math.floor(rand() * starches.length)]!;
  const picks = new Set([protein, starch]);
  while (picks.size < 5 + Math.floor(rand() * 4)) picks.add(ids[Math.floor(rand() * ids.length)]!);
  const qty = (id: string) => (ingredients[id]!.unit === 'unit' ? 1 + Math.floor(rand() * 2) : 25 + Math.floor(rand() * 8) * 25);
  synthetic.push({
    id: `synthetic_${k}`,
    cookMinutes: 20 + Math.floor(rand() * 60),
    tags: [`protein:${protein}`, `starch:${starch}`, ...(rand() < 0.2 ? ['meat_free'] : [])],
    published: true,
    ingredients: [
      ...[...picks].map((id) => ({ ingredientId: id, qtyPerServing: qty(id), optional: false })),
      { ingredientId: staples[0]!, qtyPerServing: 10, optional: false },
    ],
  });
}

const engine = createEngine();
const ctx = { ...context([BRANCH.checkers, BRANCH.shoprite], ['xtra_savings']), recipes: synthetic };
const times: number[] = [];
const RUNS = Number(process.env.BENCH_RUNS ?? 60);
for (let i = 0; i < RUNS + 5; i++) {
  const req = request({
    days: 14,
    household: { light: 1, average: 2, big: 1 },
    shops: { mainBranchId: BRANCH.checkers, topUpBranchId: BRANCH.shoprite },
    loyalty: ['xtra_savings'],
    budgetCents: i % 3 === 0 ? 60_000 : 200_000,
    mode: i % 2 === 0 ? 'balanced' : 'cheapest',
    seed: 1000 + i,
  });
  const t0 = performance.now();
  engine.plan(req, ctx);
  if (i >= 5) times.push(performance.now() - t0); // first runs warm the JIT
}
times.sort((a, b) => a - b);
const pct = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)]!;
const p50 = pct(50);
const p95 = pct(95);
console.log(`engine bench: ${synthetic.length} recipes × 14 days, ${times.length} runs → p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${times[times.length - 1]!.toFixed(1)} ms`);
if (p95 >= 300) {
  console.error('FAIL: p95 must be < 300 ms');
  process.exit(1);
}
