/** Client-side persisted location + shops (LOC-4: persisted locally; synced to the household/user_shops). */
import { z } from 'zod';

export const STORAGE_KEY = 'ms_shops_v1';

export const branchSummarySchema = z.object({
  branchId: z.number().int(),
  retailerId: z.string(),
  retailerName: z.string(),
  branchName: z.string(),
  distanceM: z.number().int().nonnegative().optional(),
});
export type BranchSummary = z.infer<typeof branchSummarySchema>;

export const savedShopsSchema = z.object({
  location: z
    .object({
      lat: z.number().finite(),
      lng: z.number().finite(),
      label: z.string().nullable(),
      source: z.enum(['gps', 'search', 'google']),
    })
    .nullable(),
  main: branchSummarySchema.nullable(),
  topUp: branchSummarySchema.nullable(),
  loyalty: z.array(z.string()).default([]),
  updatedAt: z.string(),
});
export type SavedShops = z.infer<typeof savedShopsSchema>;

export const emptyShops = (): SavedShops => ({ location: null, main: null, topUp: null, loyalty: [], updatedAt: new Date(0).toISOString() });

export function readShops(raw: string | null): SavedShops {
  if (!raw) return emptyShops();
  try {
    const r = savedShopsSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : emptyShops();
  } catch {
    return emptyShops();
  }
}

/** Tap = main shop; tap another = top-up; tap a selected one again = unselect (O2). */
export function toggleShop(s: Pick<SavedShops, 'main' | 'topUp'>, b: BranchSummary): Pick<SavedShops, 'main' | 'topUp'> {
  if (s.main?.branchId === b.branchId) return { main: s.topUp, topUp: null };
  if (s.topUp?.branchId === b.branchId) return { main: s.main, topUp: null };
  if (!s.main) return { main: b, topUp: s.topUp };
  return { main: s.main, topUp: b };
}

/** Loyalty programmes relevant to the chosen shops (ONB-2: only for retailers among the chosen shops). */
export function relevantPrograms(
  shops: Pick<SavedShops, 'main' | 'topUp'>,
  retailers: { id: string; loyaltyProgramId: string | null; loyaltyProgramName: string | null }[],
): { id: string; name: string }[] {
  const ids = new Set([shops.main?.retailerId, shops.topUp?.retailerId].filter(Boolean));
  const out = new Map<string, string>();
  for (const r of retailers) if (ids.has(r.id) && r.loyaltyProgramId && r.loyaltyProgramName) out.set(r.loyaltyProgramId, r.loyaltyProgramName);
  return [...out].map(([id, name]) => ({ id, name }));
}

/** Keep only cards that apply to the chosen shops. */
export function pruneLoyalty(loyalty: string[], programs: { id: string }[]): string[] {
  const ok = new Set(programs.map((p) => p.id));
  return [...new Set(loyalty)].filter((l) => ok.has(l)).sort();
}
