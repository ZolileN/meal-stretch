/** PRD §9.2 effective price + §9.7 savings split, per pack. */
import type { Cents, Offer } from './types';

export const DAY_MS = 86_400_000;
export const STALE_DAYS = 7;
export const MAX_AGE_DAYS = 21;
/** Guide prices (looked up online) stay usable longer so items always have a price; they're always flagged. */
export const GUIDE_MAX_AGE_DAYS = 90;

/** Whole days between observedAt and asOf (asOf is an ISO date; both treated as UTC). */
export function ageDays(observedAt: string, asOf: string): number {
  const obs = Date.parse(observedAt);
  const ref = Date.parse(asOf.length === 10 ? `${asOf}T23:59:59.999Z` : asOf);
  return Math.floor((ref - obs) / DAY_MS);
}

export function isUsable(o: Offer, asOf: string): boolean {
  return ageDays(o.observedAt, asOf) <= (o.source === 'guide' ? GUIDE_MAX_AGE_DAYS : MAX_AGE_DAYS);
}
export function isStale(o: Offer, asOf: string): boolean {
  return o.source === 'guide' || ageDays(o.observedAt, asOf) > STALE_DAYS;
}

export interface PackPrice {
  effective: Cents;
  normal: Cents;
  specials: Cents; // portion of (normal − effective) from the special
  member: Cents; // portion from the member price beyond the special
}

/**
 * effective = min(shelf, special, member). memberPriceCents is present only when the household holds the
 * card (snapshot contract). Expired specials (specialEndsOn < asOf) are ignored.
 * Split (docs/decisions.md): specials = shelf − min(shelf, special); member = min(shelf, special) − effective.
 */
export function packPrice(o: Offer, asOf: string): PackPrice {
  const normal = o.priceCents;
  const specialValid = o.specialPriceCents !== null && (o.specialEndsOn === null || o.specialEndsOn >= asOf.slice(0, 10));
  const afterSpecial = specialValid ? Math.min(normal, o.specialPriceCents!) : normal;
  const effective = o.memberPriceCents !== null ? Math.min(afterSpecial, o.memberPriceCents) : afterSpecial;
  return { effective, normal, specials: normal - afterSpecial, member: afterSpecial - effective };
}
