/** Client-side persisted location + shops (LOC-4: persisted locally; synced to the household/user_shops). */
/**
 * Hand-written validation (no zod): this module ships to every phone, and zod would add ~30 KB gz
 * to the first-load JS budget (PRD §15).
 */
export const STORAGE_KEY = 'ms_shops_v1';

export interface BranchSummary {
  branchId: number;
  retailerId: string;
  retailerName: string;
  branchName: string;
  distanceM?: number;
}

export interface SavedShops {
  location: { lat: number; lng: number; label: string | null; source: 'gps' | 'search' | 'google' } | null;
  main: BranchSummary | null;
  topUp: BranchSummary | null;
  loyalty: string[];
  updatedAt: string;
}

export const emptyShops = (): SavedShops => ({ location: null, main: null, topUp: null, loyalty: [], updatedAt: new Date(0).toISOString() });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function branch(v: unknown): BranchSummary | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !Number.isInteger(v.branchId) || !isStr(v.retailerId) || !isStr(v.retailerName) || !isStr(v.branchName)) return undefined;
  if (v.distanceM !== undefined && !(Number.isInteger(v.distanceM) && (v.distanceM as number) >= 0)) return undefined;
  return { branchId: v.branchId as number, retailerId: v.retailerId, retailerName: v.retailerName, branchName: v.branchName, ...(v.distanceM !== undefined ? { distanceM: v.distanceM as number } : {}) };
}

export function parseShops(v: unknown): SavedShops | null {
  if (!isObj(v) || !isStr(v.updatedAt)) return null;
  let location: SavedShops['location'] = null;
  if (v.location !== null) {
    const l = v.location;
    if (!isObj(l) || !isNum(l.lat) || !isNum(l.lng) || !(l.label === null || isStr(l.label)) || !['gps', 'search', 'google'].includes(l.source as string)) return null;
    location = { lat: l.lat, lng: l.lng, label: l.label as string | null, source: l.source as 'gps' | 'search' | 'google' };
  }
  const main = branch(v.main);
  const topUp = branch(v.topUp);
  if (main === undefined || topUp === undefined) return null;
  const loyalty = v.loyalty === undefined ? [] : v.loyalty;
  if (!Array.isArray(loyalty) || !loyalty.every(isStr)) return null;
  return { location, main, topUp, loyalty, updatedAt: v.updatedAt };
}

export function readShops(raw: string | null): SavedShops {
  if (!raw) return emptyShops();
  try {
    return parseShops(JSON.parse(raw)) ?? emptyShops();
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
