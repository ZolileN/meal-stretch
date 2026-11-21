/**
 * PRD §9.4 pack selection: choose a multiset of packs with total ≥ Q at minimum effective cost.
 * DP over quantity in steps of g = gcd(roundTo, pack sizes); f(q) = cheapest way to cover q.
 * Tie-break: fewer packs, then less leftover (lexicographic, which is additive so DP stays exact).
 */
import type { Cents, Offer, Qty } from './types';
import { packPrice } from './price';

export interface PackChoice {
  offer: Offer;
  count: number;
}
export interface PackSelection {
  packs: PackChoice[];
  costCents: Cents;
  normalCents: Cents;
  specialsCents: Cents;
  memberCents: Cents;
  boughtQty: Qty;
  leftoverQty: Qty;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function selectPacks(requiredQty: Qty, offers: readonly Offer[], roundTo: number, asOf: string): PackSelection | null {
  if (offers.length === 0) return null;
  if (requiredQty <= 0) return { packs: [], costCents: 0, normalCents: 0, specialsCents: 0, memberCents: 0, boughtQty: 0, leftoverQty: 0 };
  const sorted = [...offers].sort((a, b) => a.productId - b.productId || a.branchId - b.branchId);
  const prices = sorted.map((o) => packPrice(o, asOf));
  let g = Math.max(1, roundTo);
  for (const o of sorted) g = gcd(g, o.packQty);
  const n = Math.ceil(requiredQty / g);
  const sizes = sorted.map((o) => o.packQty / g);
  // f[q] = [cost, packs, total] for covering q·g; choice[q] = offer index
  const cost = new Float64Array(n + 1);
  const count = new Int32Array(n + 1);
  const total = new Float64Array(n + 1);
  const choice = new Int32Array(n + 1).fill(-1);
  for (let q = 1; q <= n; q++) {
    let bc = Infinity;
    let bn = 0;
    let bt = 0;
    let bi = -1;
    for (let i = 0; i < sorted.length; i++) {
      const rest = q - sizes[i]!;
      const c = prices[i]!.effective + (rest > 0 ? cost[rest]! : 0);
      const k = 1 + (rest > 0 ? count[rest]! : 0);
      const t = sizes[i]! + (rest > 0 ? total[rest]! : 0);
      if (c < bc || (c === bc && (k < bn || (k === bn && t < bt)))) {
        bc = c;
        bn = k;
        bt = t;
        bi = i;
      }
    }
    cost[q] = bc;
    count[q] = bn;
    total[q] = bt;
    choice[q] = bi;
  }
  const counts = new Array<number>(sorted.length).fill(0);
  for (let q = n; q > 0; ) {
    const i = choice[q]!;
    counts[i]!++;
    q -= sizes[i]!;
  }
  const packs: PackChoice[] = [];
  let costCents = 0;
  let normalCents = 0;
  let specialsCents = 0;
  let memberCents = 0;
  let boughtQty = 0;
  counts.forEach((c, i) => {
    if (c === 0) return;
    const o = sorted[i]!;
    const p = prices[i]!;
    packs.push({ offer: o, count: c });
    costCents += c * p.effective;
    normalCents += c * p.normal;
    specialsCents += c * p.specials;
    memberCents += c * p.member;
    boughtQty += c * o.packQty;
  });
  return { packs, costCents, normalCents, specialsCents, memberCents, boughtQty, leftoverQty: boughtQty - requiredQty };
}
