/** Shopping list view (LST-1…6): pack lines grouped by store then aisle, with source + date on every price. */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import { pgArray } from '@/lib/location/queries';
import { productDetails } from '@/lib/prices/snapshot';
import { loadIngredients } from '@/lib/recipes/queries';
import { formatRand } from '@/lib/money';
import { getTicks, lineKey, unpricedKey } from './actions';
import type { StoredPlan } from './service';
import { branchNames, packLabel } from './view';

export interface ListLine {
  key: string;
  ingredientId: string;
  productName: string;
  pack: string;
  packs: number;
  unitCents: number;
  normalUnitCents: number;
  totalCents: number;
  tags: ('special' | 'member' | 'stale')[];
  source: 'catalogue' | 'leaflet' | 'receipt' | 'manual' | null;
  observedAt: string | null;
}
export interface ListView {
  planId: string;
  status: StoredPlan['status'];
  totalCents: number;
  count: number;
  stores: { branchId: number; name: string; retailerName: string; subtotalCents: number; aisles: { category: string; lines: ListLine[] }[] }[];
  staples: { ingredientId: string; name: string; costCents: number | null }[];
  staplesSubtotalCents: number;
  /** Needed for the suppers but no current price at these shops: tickable, never in totals. */
  unpriced: { key: string; ingredientId: string; name: string; needed: string; category: string }[];
  ticks: Record<string, { ticked: boolean; at: string }>;
}

export async function lineSources(db: Db, lines: { productId: number; branchId: number }[]) {
  const out = new Map<string, { source: ListLine['source']; observedAt: string }>();
  if (!lines.length) return out;
  const rows = await query<{ branch_id: string | number; product_id: string | number; source: ListLine['source']; observed_at: string | Date }>(
    db,
    sql`select distinct on (b.id, cp.product_id) b.id as branch_id, cp.product_id, cp.source, cp.observed_at
        from branches b
        join current_prices cp on cp.retailer_id = b.retailer_id
          and (cp.branch_id = b.id or (cp.branch_id is null and (cp.province is null or cp.province = b.province)))
        where b.id = any(${pgArray([...new Set(lines.map((l) => l.branchId))])}::bigint[])
          and cp.product_id = any(${pgArray([...new Set(lines.map((l) => l.productId))])}::bigint[])
        order by b.id, cp.product_id, cp.is_fresh desc, (case when cp.is_fresh then cp.trust else 0 end) desc, cp.observed_at desc, cp.observation_id desc`,
  );
  for (const r of rows) out.set(`${Number(r.branch_id)}:${Number(r.product_id)}`, { source: r.source, observedAt: new Date(r.observed_at).toISOString().slice(0, 10) });
  return out;
}

export async function buildListView(db: Db, plan: StoredPlan): Promise<ListView> {
  const r = plan.result;
  const [products, ingredients, branches, sources, ticks] = await Promise.all([
    productDetails(db, r.basket.map((l) => l.productId)),
    loadIngredients(db),
    branchNames(db, [...new Set(r.basket.map((l) => l.branchId))]),
    lineSources(db, r.basket),
    getTicks(db, plan.id),
  ]);
  const stores = new Map<number, ListView['stores'][number]>();
  for (const l of r.basket) {
    const p = products.get(l.productId);
    const ing = ingredients[l.ingredientId];
    const src = sources.get(`${l.branchId}:${l.productId}`);
    const line: ListLine = {
      key: lineKey(l),
      ingredientId: l.ingredientId,
      productName: p?.name ?? l.ingredientId,
      pack: packLabel(l.packQty, ing?.unit ?? 'unit'),
      packs: l.packs,
      unitCents: l.unitCents,
      normalUnitCents: l.normalUnitCents,
      totalCents: l.packs * l.unitCents,
      tags: l.tags,
      source: src?.source ?? null,
      observedAt: src?.observedAt ?? null,
    };
    let store = stores.get(l.branchId);
    if (!store) {
      const b = branches.get(l.branchId);
      store = { branchId: l.branchId, name: b?.name ?? '', retailerName: b?.retailerName ?? '', subtotalCents: 0, aisles: [] };
      stores.set(l.branchId, store);
    }
    store.subtotalCents += line.totalCents;
    const category = p?.category ?? ing?.category ?? 'other';
    let aisle = store.aisles.find((a) => a.category === category);
    if (!aisle) store.aisles.push((aisle = { category, lines: [] }));
    aisle.lines.push(line);
  }
  const aisleOrder = (cat: string) => [...products.values()].find((p) => p.category === cat)?.aisleOrder ?? 999;
  const mainFirst = (a: { branchId: number }) => (a.branchId === plan.request.shops.mainBranchId ? 0 : 1);
  const storeList = [...stores.values()].sort((a, b) => mainFirst(a) - mainFirst(b));
  for (const s of storeList) {
    s.aisles.sort((a, b) => aisleOrder(a.category) - aisleOrder(b.category) || a.category.localeCompare(b.category));
    for (const a of s.aisles) a.lines.sort((x, y) => x.productName.localeCompare(y.productName));
  }
  const name = (id: string) => (ingredients[id] as { name?: string } | undefined)?.name ?? id;
  return {
    planId: plan.id,
    status: plan.status,
    totalCents: r.totals.paidCents,
    count: r.basket.length + r.unpriced.length,
    stores: storeList,
    staples: r.pantryStaples.map((s) => ({ ingredientId: s.ingredientId, name: name(s.ingredientId), costCents: s.costCents })),
    staplesSubtotalCents: r.pantryStaples.reduce((s, x) => s + (x.costCents ?? 0), 0),
    unpriced: r.unpriced
      .map((u) => ({
        key: unpricedKey(u.ingredientId),
        ingredientId: u.ingredientId,
        name: name(u.ingredientId),
        needed: packLabel(u.neededQty, ingredients[u.ingredientId]?.unit ?? 'unit'),
        category: ingredients[u.ingredientId]?.category ?? 'other',
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ticks: Object.fromEntries(ticks.map((t) => [t.line_key, { ticked: Boolean(t.ticked), at: new Date(t.updated_at).toISOString() }])),
  };
}

/** LST-6: plain-text list for https://wa.me/?text= (labels passed in already translated). */
export function whatsappText(v: ListView, labels: { header: string; at: (store: string) => string; total: string; noPrice?: (name: string, needed: string) => string }): string {
  const lines = [labels.header];
  for (const s of v.stores) {
    lines.push('', labels.at(s.retailerName));
    for (const a of s.aisles) for (const l of a.lines) lines.push(`- ${l.packs} × ${l.productName} (${l.pack}) ${formatRand(l.totalCents)}`);
  }
  if (v.unpriced.length && labels.noPrice) {
    lines.push('');
    for (const u of v.unpriced) lines.push(`- ${labels.noPrice(u.name, u.needed)}`);
  }
  lines.push('', labels.total);
  return lines.join('\n');
}
