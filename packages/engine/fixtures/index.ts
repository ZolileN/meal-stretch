/** Engine test fixtures: 5 households + a FICTIONAL price snapshot (from seed/prices.fixture.csv). */
import type { EngineContext, EngineIngredient, EngineRecipe, Offer, PlanRequest, PriceSnapshot } from '../src/types';
import ingredientsJson from './ingredients.json';
import recipesJson from './recipes.json';
import pricesJson from './prices.json';

export const BRANCH = { checkers: 1, shoprite: 2, pnp: 3, spar: 4, usave: 5 } as const;
export const ingredients = ingredientsJson as Record<string, EngineIngredient>;
export const recipes = recipesJson as EngineRecipe[];

const raw = pricesJson as { asOf: string; offers: { ingredientId: string; loyaltyProgram: string; offer: Offer }[] };

/** Snapshot for some branches; member prices only for cards held (matches lib/prices/snapshot.ts). */
export function snapshot(branchIds: number[], loyalty: string[] = [], asOf = raw.asOf): PriceSnapshot {
  const offers: Record<string, Offer[]> = {};
  for (const { ingredientId, loyaltyProgram, offer } of raw.offers) {
    if (!branchIds.includes(offer.branchId)) continue;
    (offers[ingredientId] ??= []).push({ ...offer, memberPriceCents: loyalty.includes(loyaltyProgram) ? offer.memberPriceCents : null });
  }
  return { asOf, offers };
}

export function context(branchIds: number[], loyalty: string[] = [], asOf?: string): EngineContext {
  return { recipes, ingredients, prices: snapshot(branchIds, loyalty, asOf) };
}

export function request(p: Partial<PlanRequest> = {}): PlanRequest {
  return {
    days: 7,
    household: { light: 0, average: 1, big: 0 },
    budgetCents: null,
    shops: { mainBranchId: BRANCH.checkers, topUpBranchId: null },
    loyalty: [],
    exclusions: [],
    neverSwapProteins: [],
    pantry: [],
    pinned: [],
    blocked: [],
    mode: 'balanced',
    maxCookMinutes: null,
    seed: 42,
    ...p,
  };
}

/** The five fixture households (BUILD 3.2). */
export const households = {
  single: request({ household: { light: 0, average: 1, big: 0 }, budgetCents: 40_000 }),
  couple: request({ household: { light: 0, average: 2, big: 0 }, budgetCents: 60_000, shops: { mainBranchId: BRANCH.pnp, topUpBranchId: BRANCH.spar }, loyalty: ['smart_shopper'] }),
  familyBigEater: request({ household: { light: 2, average: 1, big: 1 }, budgetCents: 90_000, loyalty: ['xtra_savings'], shops: { mainBranchId: BRANCH.checkers, topUpBranchId: BRANCH.shoprite } }),
  familyOfSixTight: request({ days: 7, household: { light: 3, average: 2, big: 1 }, budgetCents: 70_000, mode: 'cheapest', shops: { mainBranchId: BRANCH.shoprite, topUpBranchId: null }, loyalty: ['xtra_savings'] }),
  noPorkNoFish: request({ household: { light: 1, average: 2, big: 0 }, budgetCents: 80_000, exclusions: ['pork', 'fish'], shops: { mainBranchId: BRANCH.spar, topUpBranchId: null }, loyalty: ['spar_rewards'] }),
} satisfies Record<string, PlanRequest>;

export function householdContext(req: PlanRequest): EngineContext {
  const ids = [req.shops.mainBranchId, ...(req.shops.topUpBranchId ? [req.shops.topUpBranchId] : [])];
  return context(ids, req.loyalty);
}
