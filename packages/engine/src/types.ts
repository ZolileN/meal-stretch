/**
 * Engine contracts (PRD §9.1, §9.9). Implement against these; don't redesign them.
 * PlanRequest, PriceSnapshot, Offer and PlanResult are copied verbatim from the PRD.
 * The catalogue types and PlanningEngine interface below them are the minimum needed to call the engine.
 *
 * All money is integer cents; all quantities are integer grams, millilitres or units.
 */

export type Cents = number; // integer
export type Qty = number; // integer grams | ml | units (per ingredient.unit)

// ── §9.1 Inputs ────────────────────────────────────────────────────────────────

export interface PlanRequest {
  days: number; // 3..14 suppers
  household: { light: number; average: number; big: number }; // counts
  budgetCents: Cents | null;
  shops: { mainBranchId: number; topUpBranchId: number | null };
  loyalty: string[]; // e.g. ['xtra_savings']
  exclusions: string[]; // recipe tags to exclude: 'pork', 'fish', 'nuts' ...
  neverSwapProteins: string[]; // ingredient ids
  pantry: { ingredientId: string; qty: Qty }[];
  pinned: { day: number; recipeId: string }[]; // user-locked slots
  blocked: string[]; // recipe ids removed/disliked
  mode: 'balanced' | 'cheapest';
  maxCookMinutes: number | null;
  seed: number;
}

/** Loaded by the API layer before calling the engine. */
export interface PriceSnapshot {
  asOf: string; // ISO date
  // per ingredient, the purchasable packs at each relevant branch
  offers: Record<string /*ingredientId*/, Offer[]>;
}

export interface Offer {
  productId: number;
  branchId: number;
  packQty: Qty; // e.g. 1000 (g)
  priceCents: Cents; // shelf price
  memberPriceCents: Cents | null; // loyalty price if card held, else null
  specialPriceCents: Cents | null; // non-member promo
  specialEndsOn: string | null;
  observedAt: string;
  /** 'guide' = looked up online (search), possibly at another retailer: lowest trust, always flagged stale. */
  source: 'catalogue' | 'leaflet' | 'receipt' | 'manual' | 'guide';
}

// ── §9.9 Output ────────────────────────────────────────────────────────────────

export type BasketTag = 'special' | 'member' | 'stale';

export interface PlanResult {
  meals: {
    day: number;
    date: string;
    recipeId: string;
    servings: number;
    costCents: Cents;
    perPlateCents: Cents;
    sharesWith: number[] /*days*/;
  }[];
  basket: {
    ingredientId: string;
    productId: number;
    branchId: number;
    packs: number;
    packQty: Qty;
    unitCents: Cents;
    normalUnitCents: Cents;
    tags: BasketTag[];
    leftoverQty: Qty;
  }[];
  unpriced: { ingredientId: string; neededQty: Qty; recipes: string[] }[];
  pantryStaples: { ingredientId: string; costCents: Cents | null }[]; // excluded from totals
  totals: {
    paidCents: Cents;
    normalCents: Cents;
    savingsCents: Cents;
    specialsCents: Cents;
    memberCents: Cents;
    packEfficiencyCents: Cents;
    perPlateCents: Cents;
    items: number;
  };
  budget: {
    budgetCents: Cents | null;
    status: 'under' | 'over' | 'none';
    remainingCents: Cents | null;
    shortfallCents: Cents | null;
    maxAffordableDays: number | null;
  };
  leftovers: { ingredientId: string; qty: Qty }[]; // → pantry when plan marked shopped
  specialsUsed: number;
  priceAsOf: string;
  engineVersion: string;
  seed: number;
}

// ── Catalogue inputs (supporting types) ────────────────────────────────────────

export interface EngineIngredient {
  id: string; // 'beef_mince'
  unit: 'g' | 'ml' | 'unit';
  roundTo: number; // e.g. 50 (g), 1 (unit)
  perishable: boolean;
  pantryStaple: boolean;
  category: string; // 'meat', 'produce', 'dry', ...
}

export interface EngineRecipe {
  id: string;
  cookMinutes: number;
  /** protein:<id>, starch:<id>, meat_free, contains:<x>, one_pot, no_oven, kid_friendly */
  tags: string[];
  published: boolean;
  ingredients: { ingredientId: string; qtyPerServing: Qty; optional: boolean }[];
  /** Optional preference signal 0..1 (favourites, liked cuisines). */
  preference?: number;
}

/** Everything the engine reads besides the request. */
export interface EngineContext {
  recipes: EngineRecipe[];
  ingredients: Record<string, EngineIngredient>;
  prices: PriceSnapshot;
}

export interface SwapOption {
  recipeId: string;
  /** Total plan paidCents after the swap minus before (negative = cheaper). */
  deltaCents: Cents;
  result: PlanResult;
}

export interface PlanningEngine {
  plan(req: PlanRequest, ctx: EngineContext): PlanResult;
  /** Up to 3 alternatives for a day, ranked by objective, with price delta vs current (PLN-6). */
  swapOptions(req: PlanRequest, current: PlanResult, day: number, ctx: EngineContext): SwapOption[];
  /** Replace a day's recipe with a given recipe, or the cheapest valid one (PLN-7). */
  replace(req: PlanRequest, current: PlanResult, day: number, recipeId: string | 'cheapest', ctx: EngineContext): PlanResult;
  /** Clear a day's slot; ingredients no longer needed drop off (PLN-8). */
  remove(req: PlanRequest, current: PlanResult, day: number, ctx: EngineContext): PlanResult;
}
