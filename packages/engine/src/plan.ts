/**
 * PRD §9.5–§9.7 planner. Pure and deterministic: "today" is PriceSnapshot.asOf; randomness is
 * mulberry32(req.seed). No I/O, no clock.
 *
 *   prune → greedy (marginal J; leftovers of bought packs cost 0) → local search (replace + swap,
 *   ≤ 400 iterations) → exact re-price with the §9.4 DP → shop assignment (PLN-12) → totals.
 */
import type {
  BasketTag, Cents, EngineContext, EngineIngredient, EngineRecipe, Offer, PlanRequest, PlanResult, Qty, SwapOption,
} from './types';
import { mulberry32, shuffle } from './prng';
import { scaleQty, servingsHundredths } from './portions';
import { isStale, isUsable, packPrice } from './price';
import { selectPacks, type PackSelection } from './packs';

export const ENGINE_VERSION = '1.0.0';

export const WEIGHTS = {
  balanced: { waste: 0.5, variety: 1500, pref: 800 },
  cheapest: { waste: 0.8, variety: 600, pref: 0 },
} as const;
/** Penalty per unpriceable ingredient in a meal, so fully priced recipes win when there is a choice. */
export const UNPRICED_PENALTY = 50_000;
export const SHELF_STABLE_WASTE_FACTOR = 0.2;
export const MAX_LS_ITERATIONS = 400;
export const PRUNE_TOP = 60;
const EPS = 1e-9;

/** PLN-4 limits, pro rata per 7 days (rounded up); meat-free minimum in cheapest mode. */
export function varietyLimits(days: number) {
  return {
    protein: Math.max(1, Math.ceil((2 * days) / 7)),
    starch: Math.max(1, Math.ceil((3 * days) / 7)),
    meatFreeCheapest: Math.max(1, Math.floor(days / 7)),
  };
}

/** PLN-12: move items to the top-up shop only if each saves ≥ R5 and the split saves ≥ R30 in total. */
export const SPLIT_MIN_ITEM_CENTS = 500;
export const SPLIT_MIN_TOTAL_CENTS = 3000;
export function assignShops(
  lines: { ingredientId: string; mainCost: Cents | null; topUpCost: Cents | null }[],
): Record<string, 'main' | 'topUp'> {
  const out: Record<string, 'main' | 'topUp'> = {};
  const candidates: string[] = [];
  let total = 0;
  let forcedTrip = false;
  for (const l of lines) {
    if (l.mainCost === null && l.topUpCost !== null) {
      out[l.ingredientId] = 'topUp';
      forcedTrip = true;
      continue;
    }
    out[l.ingredientId] = 'main';
    if (l.mainCost !== null && l.topUpCost !== null && l.mainCost - l.topUpCost >= SPLIT_MIN_ITEM_CENTS) {
      candidates.push(l.ingredientId);
      total += l.mainCost - l.topUpCost;
    }
  }
  if (forcedTrip || total >= SPLIT_MIN_TOTAL_CENTS) for (const id of candidates) out[id] = 'topUp';
  return out;
}

// ── Preparation ────────────────────────────────────────────────────────────────

interface Prep {
  r: EngineRecipe;
  /** non-optional ingredient indices + scaled quantities */
  items: { i: number; q: Qty }[];
  protein: number; // interned id, -1 if none
  starch: number;
  meatFree: boolean;
  pref: number;
  unpriced: number; // count of non-staple ingredients with no offers (static)
  hasSpecial: boolean;
  standalone: number; // cost estimate for pruning
}

interface Prepared {
  req: PlanRequest;
  asOf: string;
  servH: number;
  days: number;
  w: (typeof WEIGHTS)[keyof typeof WEIGHTS];
  ingIds: string[];
  ingIndex: Map<string, number>;
  ing: EngineIngredient[];
  mainOffers: Offer[][];
  topOffers: Offer[][];
  priceOffers: Offer[][]; // main, falling back to top-up (optimisation only)
  pantry: number[];
  memo: Map<number, PackSelection | null>[];
  valid: Prep[]; // recipes passing hard filters (published, exclusions, blocked, cook time)
  byId: Map<string, Prep>;
  lim: ReturnType<typeof varietyLimits>;
  needMeatFree: number;
}

const tagVal = (tags: string[], p: string) => tags.find((t) => t.startsWith(p + ':'))?.slice(p.length + 1) ?? null;

function prepare(reqIn: PlanRequest, ctx: EngineContext): Prepared {
  const req = { ...reqIn, days: Math.min(14, Math.max(1, Math.floor(reqIn.days))) };
  const asOf = ctx.prices.asOf;
  const servH = Math.max(50, servingsHundredths(req.household));
  const ingIds = Object.keys(ctx.ingredients).sort();
  const ingIndex = new Map(ingIds.map((id, i) => [id, i]));
  const ing = ingIds.map((id) => ctx.ingredients[id]!);
  const usable = (id: string, branch: number | null) =>
    branch === null ? [] : (ctx.prices.offers[id] ?? []).filter((o) => o.branchId === branch && o.packQty > 0 && isUsable(o, asOf));
  const mainOffers = ingIds.map((id) => usable(id, req.shops.mainBranchId));
  const topOffers = ingIds.map((id) => usable(id, req.shops.topUpBranchId));
  const priceOffers = ingIds.map((_, i) => (mainOffers[i]!.length ? mainOffers[i]! : topOffers[i]!));
  const pantry = ingIds.map(() => 0);
  for (const p of req.pantry) {
    const i = ingIndex.get(p.ingredientId);
    if (i !== undefined && p.qty > 0) pantry[i]! += Math.floor(p.qty);
  }
  const interned = new Map<string, number>();
  const intern = (s: string | null) => {
    if (s === null) return -1;
    let v = interned.get(s);
    if (v === undefined) interned.set(s, (v = interned.size));
    return v;
  };
  const unitPrice = priceOffers.map((offs) =>
    offs.length ? Math.min(...offs.map((o) => packPrice(o, asOf).effective / o.packQty)) : 0,
  );
  const special = priceOffers.map((offs) => offs.some((o) => packPrice(o, asOf).specials > 0));
  const blocked = new Set(req.blocked);
  const pinnedIds = new Set(req.pinned.map((p) => p.recipeId));
  const prepOf = (r: EngineRecipe): Prep | null => {
    const items: { i: number; q: Qty }[] = [];
    let unpriced = 0;
    let standalone = 0;
    let hasSpecial = false;
    for (const ri of r.ingredients) {
      if (ri.optional) continue;
      const i = ingIndex.get(ri.ingredientId);
      if (i === undefined) return null; // unknown ingredient: recipe unusable
      const q = scaleQty(ri.qtyPerServing, servH, ing[i]!.roundTo);
      if (q <= 0) continue;
      items.push({ i, q });
      if (ing[i]!.pantryStaple) continue;
      if (priceOffers[i]!.length === 0 && pantry[i]! < q) unpriced++;
      standalone += q * unitPrice[i]!;
      if (special[i]) hasSpecial = true;
    }
    const pref = (r.preference ?? 0) + (req.maxCookMinutes ? Math.max(0, 1 - r.cookMinutes / req.maxCookMinutes) : 0);
    return {
      r, items, protein: intern(tagVal(r.tags, 'protein')), starch: intern(tagVal(r.tags, 'starch')),
      meatFree: r.tags.includes('meat_free'), pref, unpriced, hasSpecial, standalone,
    };
  };
  const all = [...ctx.recipes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map<string, Prep>();
  const valid: Prep[] = [];
  for (const r of all) {
    const p = prepOf(r);
    if (!p) continue;
    byId.set(r.id, p);
    const excluded = req.exclusions.some((ex) => r.tags.includes(`contains:${ex}`) || r.tags.includes(ex));
    const ok = r.published && !excluded && !blocked.has(r.id) && (req.maxCookMinutes === null || r.cookMinutes <= req.maxCookMinutes);
    if (ok || pinnedIds.has(r.id)) valid.push(p);
  }
  const lim = varietyLimits(req.days);
  return {
    req, asOf, servH, days: req.days, w: WEIGHTS[req.mode], ingIds, ingIndex, ing, mainOffers, topOffers, priceOffers, pantry,
    memo: ingIds.map(() => new Map()), valid, byId, lim, needMeatFree: req.mode === 'cheapest' ? lim.meatFreeCheapest : 0,
  };
}

function dp(P: Prepared, i: number, qty: Qty): PackSelection | null {
  const m = P.memo[i]!;
  let s = m.get(qty);
  if (s === undefined) {
    s = selectPacks(qty, P.priceOffers[i]!, P.ing[i]!.roundTo, P.asOf);
    m.set(qty, s);
  }
  return s;
}

/** Ingredient's contribution to J: basket cost + λ_waste × value of leftovers (after pantry). */
function ingTerm(P: Prepared, i: number, need: Qty): number {
  if (P.ing[i]!.pantryStaple) return 0;
  const buy = need - P.pantry[i]!;
  if (buy <= 0) return 0;
  const s = dp(P, i, buy);
  if (!s || s.boughtQty === 0) return 0;
  const factor = P.ing[i]!.perishable ? 1 : SHELF_STABLE_WASTE_FACTOR;
  return s.costCents + P.w.waste * ((s.leftoverQty * s.costCents) / s.boughtQty) * factor;
}

// ── Selection state ────────────────────────────────────────────────────────────

interface State {
  slots: (Prep | null)[]; // index 0 = day 1
  pinned: boolean[];
  needs: number[];
  used: Set<string>;
}

function varietyOf(P: Prepared, slots: (Prep | null)[]): number {
  const pc = new Map<number, number>();
  const sc = new Map<number, number>();
  let pen = 0;
  for (let d = 0; d < slots.length; d++) {
    const s = slots[d];
    if (!s) continue;
    if (s.protein >= 0) pc.set(s.protein, (pc.get(s.protein) ?? 0) + 1);
    if (s.starch >= 0) sc.set(s.starch, (sc.get(s.starch) ?? 0) + 1);
    const prev = d > 0 ? slots[d - 1] : null;
    if (prev && prev.protein >= 0 && prev.protein === s.protein) pen += 1;
  }
  for (const n of pc.values()) pen += Math.max(0, n - 1);
  for (const n of sc.values()) pen += 0.5 * Math.max(0, n - 1);
  return pen;
}

function objective(P: Prepared, st: State): number {
  let j = 0;
  for (let i = 0; i < P.ingIds.length; i++) if (st.needs[i]! > 0) j += ingTerm(P, i, st.needs[i]!);
  for (const s of st.slots) if (s) j += -P.w.pref * s.pref + UNPRICED_PENALTY * s.unpriced;
  return j + P.w.variety * varietyOf(P, st.slots);
}

/** ΔJ of putting `next` in slot d (currently `cur`), without mutating the state. */
function deltaReplace(P: Prepared, st: State, d: number, next: Prep | null): number {
  const cur = st.slots[d] ?? null;
  if (cur === next) return 0;
  const change = new Map<number, number>();
  if (cur) for (const it of cur.items) change.set(it.i, (change.get(it.i) ?? 0) - it.q);
  if (next) for (const it of next.items) change.set(it.i, (change.get(it.i) ?? 0) + it.q);
  let delta = 0;
  for (const [i, dq] of change) if (dq !== 0) delta += ingTerm(P, i, st.needs[i]! + dq) - ingTerm(P, i, st.needs[i]!);
  if (cur) delta -= -P.w.pref * cur.pref + UNPRICED_PENALTY * cur.unpriced;
  if (next) delta += -P.w.pref * next.pref + UNPRICED_PENALTY * next.unpriced;
  const before = varietyOf(P, st.slots);
  st.slots[d] = next;
  const after = varietyOf(P, st.slots);
  st.slots[d] = cur;
  return delta + P.w.variety * (after - before);
}

function apply(st: State, d: number, next: Prep | null) {
  const cur = st.slots[d];
  if (cur) {
    for (const it of cur.items) st.needs[it.i]! -= it.q;
    st.used.delete(cur.r.id);
  }
  if (next) {
    for (const it of next.items) st.needs[it.i]! += it.q;
    st.used.add(next.r.id);
  }
  st.slots[d] = next;
}

/** Hard constraints for putting `p` in slot d given every other slot. */
function canPlace(P: Prepared, st: State, d: number, p: Prep, relaxVariety = false): boolean {
  const cur = st.slots[d];
  if (st.used.has(p.r.id) && cur?.r.id !== p.r.id) return false;
  let prot = 0;
  let starch = 0;
  let meatFree = 0;
  let open = 0;
  for (let k = 0; k < st.slots.length; k++) {
    if (k === d) continue;
    const s = st.slots[k];
    if (!s) {
      open++;
      continue;
    }
    if (s.protein >= 0 && s.protein === p.protein) prot++;
    if (s.starch >= 0 && s.starch === p.starch) starch++;
    if (s.meatFree) meatFree++;
  }
  if (!relaxVariety && (prot + 1 > P.lim.protein || starch + 1 > P.lim.starch)) return false;
  if (P.needMeatFree > 0 && !p.meatFree) {
    // keep enough open slots to still reach the meat-free minimum
    if (meatFree + open < P.needMeatFree) return false;
  }
  return true;
}

function emptyState(P: Prepared): State {
  return { slots: new Array(P.days).fill(null), pinned: new Array(P.days).fill(false), needs: P.ingIds.map(() => 0), used: new Set() };
}

function candidatesFor(P: Prepared): Prep[] {
  const pinned = new Set(P.req.pinned.map((p) => p.recipeId));
  const score = (p: Prep) => p.standalone + UNPRICED_PENALTY * p.unpriced - P.w.pref * p.pref;
  const ranked = [...P.valid].sort((a, b) => score(a) - score(b) || (a.r.id < b.r.id ? -1 : 1));
  const keep = new Set(ranked.slice(0, PRUNE_TOP).map((p) => p.r.id));
  return ranked.filter((p) => keep.has(p.r.id) || p.hasSpecial || pinned.has(p.r.id));
}

function optimise(P: Prepared, rand: () => number): State {
  const st = emptyState(P);
  for (const pin of P.req.pinned) {
    const d = pin.day - 1;
    const p = P.byId.get(pin.recipeId);
    if (d < 0 || d >= P.days || !p || st.used.has(p.r.id)) continue;
    apply(st, d, p);
    st.pinned[d] = true;
  }
  const cands = shuffle(candidatesFor(P), rand);

  // Greedy: fill days in order with the lowest marginal J.
  for (let d = 0; d < P.days; d++) {
    if (st.slots[d]) continue;
    for (const relax of [false, true]) {
      let best: Prep | null = null;
      let bestDelta = Infinity;
      for (const c of cands) {
        if (!canPlace(P, st, d, c, relax)) continue;
        const delta = deltaReplace(P, st, d, c);
        if (delta < bestDelta - EPS) {
          bestDelta = delta;
          best = c;
        }
      }
      if (best) {
        apply(st, d, best);
        break;
      }
    }
  }

  // Local search: replace one slot with its best alternative, or swap two slots. Accept if J decreases.
  const free = [...Array(P.days).keys()].filter((d) => !st.pinned[d]);
  if (free.length === 0) return st;
  let stale = 0;
  for (let it = 0; it < MAX_LS_ITERATIONS && stale < free.length * 3; it++) {
    const d = free[Math.floor(rand() * free.length)]!;
    let improved = false;
    if (rand() < 0.75 || free.length < 2) {
      let best: Prep | null = null;
      let bestDelta = -EPS;
      for (const c of cands) {
        if (c === st.slots[d] || !canPlace(P, st, d, c)) continue;
        const delta = deltaReplace(P, st, d, c);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = c;
        }
      }
      if (best) {
        apply(st, d, best);
        improved = true;
      }
    } else {
      const e = free[Math.floor(rand() * free.length)]!;
      if (e !== d && st.slots[d] && st.slots[e]) {
        const before = varietyOf(P, st.slots);
        const a = st.slots[d]!;
        st.slots[d] = st.slots[e]!;
        st.slots[e] = a;
        if (varietyOf(P, st.slots) < before - EPS) improved = true;
        else {
          st.slots[e] = st.slots[d]!;
          st.slots[d] = a;
        }
      }
    }
    stale = improved ? 0 : stale + 1;
  }
  return st;
}

// ── Exact pricing ──────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Split `total` across weights with the largest-remainder method (exact, deterministic). */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k]!.i]! += 1;
  return out;
}

function finalize(P: Prepared, slots: { day: number; p: Prep }[], budgetSearch: number | null = null): PlanResult {
  const { req, asOf } = P;
  const need = P.ingIds.map(() => 0);
  for (const { p } of slots) for (const it of p.items) need[it.i]! += it.q;

  const basket: PlanResult['basket'] = [];
  const unpriced: PlanResult['unpriced'] = [];
  const pantryStaples: PlanResult['pantryStaples'] = [];
  const leftovers: PlanResult['leftovers'] = [];
  const paidByIng = new Map<number, number>();
  const branchByIng = new Map<number, number>();
  const pending: { i: number; buy: number; main: PackSelection | null; top: PackSelection | null }[] = [];
  let specials = 0;
  let member = 0;

  for (let i = 0; i < P.ingIds.length; i++) {
    const id = P.ingIds[i]!;
    const n = need[i]!;
    const have = P.pantry[i]!;
    if (n === 0) {
      if (have > 0) leftovers.push({ ingredientId: id, qty: have });
      continue;
    }
    const buy = Math.max(0, n - have);
    if (P.ing[i]!.pantryStaple) {
      const s = buy > 0 ? selectPacks(buy, P.priceOffers[i]!, P.ing[i]!.roundTo, asOf) : null;
      pantryStaples.push({ ingredientId: id, costCents: buy === 0 ? 0 : s ? s.costCents : null });
      if (have - n > 0) leftovers.push({ ingredientId: id, qty: have - n });
      continue;
    }
    if (buy === 0) {
      leftovers.push({ ingredientId: id, qty: have - n });
      continue;
    }
    const main = selectPacks(buy, P.mainOffers[i]!, P.ing[i]!.roundTo, asOf);
    const top = req.shops.topUpBranchId !== null ? selectPacks(buy, P.topOffers[i]!, P.ing[i]!.roundTo, asOf) : null;
    if (!main && !top) {
      const recipes = [...new Set(slots.filter(({ p }) => p.items.some((it) => it.i === i)).map(({ p }) => p.r.id))].sort();
      unpriced.push({ ingredientId: id, neededQty: buy, recipes });
      continue;
    }
    pending.push({ i, buy, main, top });
  }

  const where = assignShops(pending.map((x) => ({ ingredientId: P.ingIds[x.i]!, mainCost: x.main?.costCents ?? null, topUpCost: x.top?.costCents ?? null })));
  for (const x of pending) {
    const id = P.ingIds[x.i]!;
    const sel = (where[id] === 'topUp' ? x.top : x.main)!;
    const largest = sel.packs.reduce((a, b) => (b.offer.packQty > a.offer.packQty ? b : a));
    let paid = 0;
    for (const pc of sel.packs) {
      const pp = packPrice(pc.offer, asOf);
      const tags: BasketTag[] = [];
      if (pp.specials > 0) tags.push('special');
      if (pp.member > 0) tags.push('member');
      if (isStale(pc.offer, asOf)) tags.push('stale');
      basket.push({
        ingredientId: id, productId: pc.offer.productId, branchId: pc.offer.branchId, packs: pc.count, packQty: pc.offer.packQty,
        unitCents: pp.effective, normalUnitCents: pp.normal, tags, leftoverQty: pc === largest ? sel.leftoverQty : 0,
      });
      paid += pc.count * pp.effective;
      specials += pc.count * pp.specials;
      member += pc.count * pp.member;
    }
    paidByIng.set(x.i, paid);
    branchByIng.set(x.i, sel.packs[0]!.offer.branchId);
    const left = P.pantry[x.i]! + sel.boughtQty - need[x.i]!;
    if (left > 0) leftovers.push({ ingredientId: id, qty: left });
  }
  basket.sort((a, b) => (a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : a.productId - b.productId));

  // Meal costs: each ingredient's paid cost split across meals by quantity (sums exactly to paid).
  const mealCost = new Map<number, number>(slots.map(({ day }) => [day, 0]));
  for (const [i, paid] of paidByIng) {
    const users = slots.filter(({ p }) => p.items.some((it) => it.i === i));
    const parts = allocate(paid, users.map(({ p }) => p.items.find((it) => it.i === i)!.q));
    users.forEach(({ day }, k) => mealCost.set(day, mealCost.get(day)! + parts[k]!));
  }

  // Pack efficiency: each meal bought on its own (same shop, no pantry) minus the joint basket (no pantry).
  let independent = 0;
  let jointNoPantry = 0;
  for (const [i, branch] of branchByIng) {
    const offers = branch === req.shops.mainBranchId ? P.mainOffers[i]! : P.topOffers[i]!;
    const rt = P.ing[i]!.roundTo;
    const joint = selectPacks(need[i]!, offers, rt, asOf);
    if (!joint) continue;
    jointNoPantry += joint.costCents;
    for (const { p } of slots) {
      const it = p.items.find((x) => x.i === i);
      if (it) independent += selectPacks(it.q, offers, rt, asOf)?.costCents ?? 0;
    }
  }

  const paidCents = basket.reduce((s, l) => s + l.packs * l.unitCents, 0);
  const normalCents = basket.reduce((s, l) => s + l.packs * l.normalUnitCents, 0);
  const servingsN = P.servH / 100;
  const bought = new Set(paidByIng.keys());
  const meals: PlanResult['meals'] = slots
    .map(({ day, p }) => {
      const costCents = mealCost.get(day)!;
      const mine = new Set(p.items.filter((it) => bought.has(it.i)).map((it) => it.i));
      const sharesWith = slots
        .filter((o) => o.day !== day && o.p.items.some((it) => mine.has(it.i)))
        .map((o) => o.day)
        .sort((a, b) => a - b);
      return { day, date: addDays(asOf, day - 1), recipeId: p.r.id, servings: servingsN, costCents, perPlateCents: Math.round(costCents / servingsN), sharesWith };
    })
    .sort((a, b) => a.day - b.day);

  const budgetCents = req.budgetCents;
  const over = budgetCents !== null && paidCents > budgetCents;
  return {
    meals,
    basket,
    unpriced: unpriced.sort((a, b) => (a.ingredientId < b.ingredientId ? -1 : 1)),
    pantryStaples: pantryStaples.sort((a, b) => (a.ingredientId < b.ingredientId ? -1 : 1)),
    totals: {
      paidCents,
      normalCents,
      savingsCents: normalCents - paidCents,
      specialsCents: specials,
      memberCents: member,
      packEfficiencyCents: Math.max(0, independent - jointNoPantry),
      perPlateCents: meals.length ? Math.round(paidCents / (servingsN * meals.length)) : 0,
      items: basket.length,
    },
    budget: {
      budgetCents,
      status: budgetCents === null ? 'none' : over ? 'over' : 'under',
      remainingCents: budgetCents === null || over ? null : budgetCents - paidCents,
      shortfallCents: over ? paidCents - budgetCents! : null,
      maxAffordableDays: over ? budgetSearch : null,
    },
    leftovers: leftovers.sort((a, b) => (a.ingredientId < b.ingredientId ? -1 : 1)),
    specialsUsed: basket.filter((l) => l.tags.includes('special')).length,
    priceAsOf: asOf.slice(0, 10),
    engineVersion: ENGINE_VERSION,
    seed: req.seed,
  };
}

const slotsOf = (st: State) => st.slots.flatMap((p, d) => (p ? [{ day: d + 1, p }] : []));

function runPlan(req: PlanRequest, ctx: EngineContext): { P: Prepared; st: State } {
  const P = prepare(req, ctx);
  return { P, st: optimise(P, mulberry32(req.seed)) };
}

/** §9.6: max days whose cheapest plan fits the budget (binary search), 0 if none. */
function maxAffordableDays(req: PlanRequest, ctx: EngineContext): number {
  const budget = req.budgetCents!;
  const fits = (days: number) => {
    const { P, st } = runPlan({ ...req, days, mode: 'cheapest', pinned: req.pinned.filter((p) => p.day <= days) }, ctx);
    return finalize(P, slotsOf(st)).totals.paidCents <= budget;
  };
  let lo = 0;
  let hi = req.days - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function plan(req: PlanRequest, ctx: EngineContext): PlanResult {
  const { P, st } = runPlan(req, ctx);
  const result = finalize(P, slotsOf(st));
  if (result.budget.status === 'over' && req.mode === 'cheapest') {
    return finalize(P, slotsOf(st), maxAffordableDays(P.req, ctx));
  }
  return result;
}

// ── Meal actions (PLN-6…9) ─────────────────────────────────────────────────────

function stateFrom(P: Prepared, current: PlanResult): State {
  const st = emptyState(P);
  for (const m of current.meals) {
    const p = P.byId.get(m.recipeId);
    const d = m.day - 1;
    if (p && d >= 0 && d < P.days) apply(st, d, p);
  }
  return st;
}

function alternatives(P: Prepared, st: State, d: number, current: Prep | null): Prep[] {
  const neverSwap = current && P.req.neverSwapProteins.length > 0 ? tagVal(current.r.tags, 'protein') : null;
  const lockProtein = neverSwap !== null && P.req.neverSwapProteins.includes(neverSwap);
  return P.valid.filter((c) => {
    if (c === current || !canPlace(P, st, d, c)) return false;
    if (lockProtein && c.protein !== current!.protein) return false;
    return true;
  });
}

export function swapOptions(req: PlanRequest, current: PlanResult, day: number, ctx: EngineContext): SwapOption[] {
  const P = prepare(req, ctx);
  const st = stateFrom(P, current);
  const d = day - 1;
  const cur = st.slots[d] ?? null;
  const ranked = alternatives(P, st, d, cur)
    .map((c) => ({ c, delta: deltaReplace(P, st, d, c) }))
    .sort((a, b) => a.delta - b.delta || (a.c.r.id < b.c.r.id ? -1 : 1))
    .slice(0, 3);
  return ranked.map(({ c }) => {
    const prev = st.slots[d] ?? null;
    st.slots[d] = c;
    const result = finalize(P, slotsOf(st));
    st.slots[d] = prev;
    return { recipeId: c.r.id, deltaCents: result.totals.paidCents - current.totals.paidCents, result };
  });
}

export function replace(req: PlanRequest, current: PlanResult, day: number, recipeId: string | 'cheapest', ctx: EngineContext): PlanResult {
  const P = prepare(req, ctx);
  const st = stateFrom(P, current);
  const d = day - 1;
  if (d < 0 || d >= P.days) throw new RangeError(`day ${day} is outside the plan`);
  const cur = st.slots[d] ?? null;
  let next: Prep | undefined;
  if (recipeId === 'cheapest') {
    let best = Infinity;
    for (const c of alternatives(P, st, d, cur)) {
      st.slots[d] = c;
      const paid = finalize(P, slotsOf(st)).totals.paidCents;
      if (paid < best) {
        best = paid;
        next = c;
      }
    }
    st.slots[d] = cur;
    if (!next) return finalize(P, slotsOf(st));
  } else {
    next = P.byId.get(recipeId);
    if (!next || !next.r.published) throw new Error(`unknown recipe ${recipeId}`);
    if (st.used.has(recipeId) && cur?.r.id !== recipeId) throw new Error(`recipe ${recipeId} is already in the plan`);
  }
  apply(st, d, next);
  return finalize(P, slotsOf(st));
}

export function remove(req: PlanRequest, current: PlanResult, day: number, ctx: EngineContext): PlanResult {
  const P = prepare(req, ctx);
  const st = stateFrom(P, current);
  if (day >= 1 && day <= P.days) apply(st, day - 1, null);
  return finalize(P, slotsOf(st));
}

/** Exposed for tests/benchmarks: the objective of a finished plan's selection. */
export function objectiveOf(req: PlanRequest, current: PlanResult, ctx: EngineContext): number {
  const P = prepare(req, ctx);
  return objective(P, stateFrom(P, current));
}
