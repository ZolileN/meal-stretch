/** PRD §9.3 portions. Integer maths in hundredths of a serving. */
import type { PlanRequest, Qty } from './types';

export const PORTION_WEIGHTS = { light: 75, average: 100, big: 140 } as const; // hundredths

/** servings ×100, rounded up to the nearest 0.5 serving (50). */
export function servingsHundredths(h: PlanRequest['household']): number {
  const raw = h.light * PORTION_WEIGHTS.light + h.average * PORTION_WEIGHTS.average + h.big * PORTION_WEIGHTS.big;
  return Math.ceil(raw / 50) * 50;
}

export function servings(h: PlanRequest['household']): number {
  return servingsHundredths(h) / 100;
}

/** qtyPerServing × servings, rounded up to the ingredient's roundTo. */
export function scaleQty(qtyPerServing: Qty, servHundredths: number, roundTo: number): Qty {
  if (qtyPerServing <= 0 || servHundredths <= 0) return 0;
  const step = Math.max(1, roundTo);
  return Math.ceil((qtyPerServing * servHundredths) / (100 * step)) * step;
}
