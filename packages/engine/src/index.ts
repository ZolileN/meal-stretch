export * from './types';
export { ENGINE_VERSION, WEIGHTS, assignShops, varietyLimits, objectiveOf, reprice } from './plan';
export { selectPacks, type PackSelection } from './packs';
export { packPrice, ageDays, isStale, isUsable } from './price';
export { servings, servingsHundredths, scaleQty } from './portions';
export { mulberry32 } from './prng';

import type { PlanningEngine } from './types';
import { plan, remove, replace, swapOptions } from './plan';

export function createEngine(): PlanningEngine {
  return { plan, swapOptions, replace, remove };
}
