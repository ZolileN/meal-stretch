/**
 * Product matching (PRD §10.3): exact alias → fuzzy (pg_trgm ≥ 0.55 + matching size) → unmatched queue.
 * Normalisation: lowercase, strip brand noise words, standardise units (kg→g, l→ml), parse multipacks.
 */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import { normName } from '@/lib/location/normalize';

const NOISE = /\b(fixture|ritebrand|no name|house brand|pnp|spar|checkers|shoprite|woolworths|ww|usave|boxer|special|promo|each|ea|pack|pkt|x1)\b/g;

export interface Size {
  qty: number;
  unit: 'g' | 'ml' | 'unit';
}

/** "2kg" → 2000 g; "750ml" → 750 ml; "6s" → 6 units; "6 x 410g" → 2460 g; "1.5 L" → 1500 ml. */
export function parseSize(text: string | null | undefined): Size | null {
  if (!text) return null;
  const s = text.toLowerCase().replace(/,/g, '.');
  const multi = /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|lt)\b/.exec(s);
  if (multi) {
    const one = parseSize(`${multi[2]}${multi[3]}`)!;
    return { qty: Math.round(one.qty * Number(multi[1])), unit: one.unit };
  }
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|gr|ml|l|lt|litre|liter|s|pc|pcs|units?)\b/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'kg':
      return { qty: Math.round(n * 1000), unit: 'g' };
    case 'g':
    case 'gr':
      return { qty: Math.round(n), unit: 'g' };
    case 'l':
    case 'lt':
    case 'litre':
    case 'liter':
      return { qty: Math.round(n * 1000), unit: 'ml' };
    case 'ml':
      return { qty: Math.round(n), unit: 'ml' };
    default:
      return { qty: Math.round(n), unit: 'unit' };
  }
}

export function normaliseProductName(name: string): string {
  return normName(name.replace(/(\d+)\s*[x×]\s*\d+(?:[.,]\d+)?\s*(kg|g|ml|l)\b/gi, ' ').replace(/\d+(?:[.,]\d+)?\s*(kg|g|gr|ml|l|lt|s)\b/gi, ' '))
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Match {
  productId: number;
  confidence: number;
  method: 'alias' | 'fuzzy';
}

export const FUZZY_THRESHOLD = 0.55;

export async function matchProduct(db: Db, retailerId: string | null, rawName: string, sizeText: string | null): Promise<Match | null> {
  const norm = normaliseProductName(rawName);
  if (norm.length < 2) return null;
  const size = parseSize(sizeText) ?? parseSize(rawName);
  const scope = retailerId ? sql`and p.retailer_id = ${retailerId}` : sql``;
  const exact = await query<{ product_id: string | number; pack_qty: number; pack_unit: string }>(
    db,
    sql`select a.product_id, p.pack_qty, p.pack_unit from product_aliases a join products p on p.id = a.product_id
        where a.alias_norm = ${norm} and p.active ${scope} order by a.product_id limit 5`,
  );
  const sized = exact.find((r) => !size || (r.pack_unit === size.unit && Number(r.pack_qty) === size.qty)) ?? (size ? undefined : exact[0]);
  if (sized) return { productId: Number(sized.product_id), confidence: 1, method: 'alias' };
  const fuzzy = await query<{ product_id: string | number; pack_qty: number; pack_unit: string; sim: number }>(
    db,
    sql`select a.product_id, p.pack_qty, p.pack_unit, similarity(a.alias_norm, ${norm}) as sim
        from product_aliases a join products p on p.id = a.product_id
        where p.active ${scope} and a.alias_norm % ${norm}
        order by sim desc, a.product_id limit 10`,
  );
  for (const f of fuzzy) {
    if (Number(f.sim) < FUZZY_THRESHOLD) break;
    // §10.3: fuzzy matches also need a matching size
    if (size && f.pack_unit === size.unit && Number(f.pack_qty) === size.qty) return { productId: Number(f.product_id), confidence: Number(f.sim), method: 'fuzzy' };
  }
  return null;
}
