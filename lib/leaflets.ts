/**
 * Admin leaflet flow (ADM-2) + unmatched queue (ADM-3): upload → Claude extraction → review table
 * (edit / approve / reject per line) → publish as `leaflet` observations → refresh current_prices.
 */
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { query, type Db } from '@/lib/db';
import { claudeTool, models } from '@/lib/claude';
import { EXTRACTION_TOOL, extractionSchema, validateLines, type ExtractedLine } from '@/lib/extraction';
import { matchProduct, normaliseProductName, parseSize } from '@/lib/prices/match';
import { productAlias, refreshCurrentPrices } from '@/lib/prices/import';
import { isoDateInSA } from '@/lib/period';

const SYSTEM = `You read South African supermarket specials leaflets. Call record_document exactly once.
document_type "leaflet". Money in integer cents. price_cents is the advertised price; was_price_cents the normal
price when shown ("was", "save"). member_only true for card-only prices (Xtra Savings, Smart Shopper, SPAR Rewards...).
date = first valid day, valid_until = last valid day (YYYY-MM-DD). size_text as printed ("2kg", "6 x 410g").`;

export interface ReviewLine extends ExtractedLine {
  index: number;
  suggestion: { productId: number; name: string; confidence: number } | null;
}

export async function extractLeaflet(db: Db, opts: { retailerId: string; uploadedBy: string | null; file: { base64: string; type: string } }) {
  const isPdf = opts.file.type === 'application/pdf';
  const { output } = await claudeTool({
    db,
    purpose: 'leaflet',
    householdId: null,
    model: models.vision(),
    system: SYSTEM,
    tool: EXTRACTION_TOOL,
    schema: extractionSchema,
    content: [
      isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: opts.file.base64 } }
        : { type: 'image', source: { type: 'base64', media_type: opts.file.type as 'image/jpeg', data: opts.file.base64 } },
      { type: 'text', text: 'Extract every product special in this leaflet.' },
    ],
  });
  return createReviewBatch(db, opts.retailerId, opts.uploadedBy, output);
}

export async function createReviewBatch(db: Db, retailerId: string, uploadedBy: string | null, raw: unknown): Promise<number> {
  const ex = extractionSchema.parse(raw);
  const { lines, rejected } = validateLines(ex.lines);
  const review: ReviewLine[] = [];
  for (const [index, l] of lines.entries()) {
    const m = await matchProduct(db, retailerId, l.raw_name, l.size_text);
    const name = m ? (await query<{ name: string }>(db, sql`select name from products where id = ${m.productId}`))[0]?.name ?? '' : '';
    review.push({ ...l, index, suggestion: m ? { productId: m.productId, name, confidence: m.confidence } : null });
  }
  const [b] = await query<{ id: string | number }>(
    db,
    sql`insert into ingest_batches (kind, retailer_id, uploaded_by, status, raw)
        values ('leaflet', ${retailerId}, ${uploadedBy}::uuid, 'review',
                ${JSON.stringify({ date: ex.date, valid_until: ex.valid_until, lines: review, rejected })}::jsonb)
        returning id`,
  );
  return Number(b!.id);
}

export async function reviewBatch(db: Db, batchId: number) {
  const [b] = await query<{ id: number; retailer_id: string; status: string; raw: { date: string | null; valid_until: string | null; lines: ReviewLine[]; rejected: unknown[] } | string; created_at: string }>(
    db,
    sql`select id, retailer_id, status, raw, created_at from ingest_batches where id = ${batchId} and kind = 'leaflet'`,
  );
  if (!b) return null;
  const raw = typeof b.raw === 'string' ? JSON.parse(b.raw) : b.raw;
  return { id: Number(b.id), retailerId: b.retailer_id, status: b.status, date: raw.date, validUntil: raw.valid_until, lines: raw.lines as ReviewLine[], rejected: raw.rejected };
}

export const decisionSchema = z.object({
  index: z.number().int().min(0),
  action: z.enum(['approve', 'reject']),
  priceCents: z.number().int().positive().max(500_000).optional(),
  wasPriceCents: z.number().int().positive().max(500_000).nullable().optional(),
  productId: z.number().int().positive().nullable().optional(),
  newProduct: z
    .object({ name: z.string().min(2).max(200), packQty: z.number().int().positive(), packUnit: z.enum(['g', 'ml', 'unit']), ingredientId: z.string().regex(/^[a-z0-9_]{2,60}$/) })
    .nullable()
    .optional(),
});
export type Decision = z.infer<typeof decisionSchema>;

/** Publish approved lines as chain-wide leaflet observations; approved-but-unmapped lines go to the unmatched queue. */
export async function publishBatch(db: Db, batchId: number, decisions: Decision[]) {
  const b = await reviewBatch(db, batchId);
  if (!b || b.status !== 'review') throw new Error('Batch is not awaiting review');
  const observedAt = `${b.date ?? isoDateInSA(new Date())}T08:00:00+02:00`;
  let published = 0;
  let queued = 0;
  for (const d of decisions) {
    const line = b.lines[d.index];
    if (!line || d.action !== 'approve') continue;
    let productId = d.productId ?? line.suggestion?.productId ?? null;
    if (!productId && d.newProduct) {
      const [p] = await query<{ id: string | number }>(
        db,
        sql`insert into products (retailer_id, ingredient_id, name, pack_qty, pack_unit,
                                  category_id)
            values (${b.retailerId}, ${d.newProduct.ingredientId}, ${d.newProduct.name}, ${d.newProduct.packQty}, ${d.newProduct.packUnit},
                    (select c.id from product_categories c join ingredients i on i.category = c.name where i.id = ${d.newProduct.ingredientId}))
            on conflict (retailer_id, lower(name), coalesce(lower(brand), ''), pack_qty, pack_unit) do update set active = true
            returning id`,
      );
      productId = Number(p!.id);
    }
    if (!productId) {
      await db.execute(
        sql`insert into unmatched_items (batch_id, retailer_id, raw_name, size_text, price_cents) values (${batchId}, ${b.retailerId}, ${line.raw_name}, ${line.size_text}, ${d.priceCents ?? line.price_cents})`,
      );
      queued++;
      continue;
    }
    await db.execute(
      sql`insert into product_aliases (product_id, alias_norm, source) values (${productId}, ${normaliseProductName(line.raw_name)}, 'leaflet')
          on conflict (product_id, alias_norm) do nothing`,
    );
    const price = d.priceCents ?? line.price_cents;
    const was = d.wasPriceCents !== undefined ? d.wasPriceCents : line.was_price_cents;
    // Without a printed normal price we record the advertised price as the shelf price (never inflate savings).
    const shelf = was && was > price ? was : price;
    const special = shelf > price && !line.member_only ? price : null;
    const member = shelf > price && line.member_only ? price : null;
    await db.execute(
      sql`insert into price_observations (product_id, branch_id, retailer_id, price_cents, member_price_cents, special_price_cents, special_ends_on, source, observed_at, ingest_batch_id)
          values (${productId}, null, ${b.retailerId}, ${shelf}, ${member}, ${special}, ${b.validUntil}::date, 'leaflet', ${observedAt}::timestamptz, ${batchId})`,
    );
    published++;
  }
  await db.execute(sql`update ingest_batches set status = 'published' where id = ${batchId}`);
  await refreshCurrentPrices(db);
  return { published, queued };
}

export async function rejectBatch(db: Db, batchId: number) {
  await db.execute(sql`update ingest_batches set status = 'rejected' where id = ${batchId} and status = 'review'`);
}

/** ADM-3 */
export async function unmatchedQueue(db: Db, limit = 100) {
  return query<{ id: number; retailer_id: string | null; raw_name: string; size_text: string | null; price_cents: number | null; created_at: string }>(
    db,
    sql`select id, retailer_id, raw_name, size_text, price_cents, created_at from unmatched_items where status = 'open' order by created_at limit ${limit}`,
  );
}

export async function resolveUnmatched(db: Db, itemId: number, action: { productId: number } | { ignore: true }) {
  const [item] = await query<{ raw_name: string; size_text: string | null }>(db, sql`select raw_name, size_text from unmatched_items where id = ${itemId}`);
  if (!item) throw new Error('not found');
  if ('ignore' in action) {
    await db.execute(sql`update unmatched_items set status = 'ignored' where id = ${itemId}`);
    return;
  }
  await db.execute(
    sql`insert into product_aliases (product_id, alias_norm, source) values (${action.productId}, ${normaliseProductName(item.raw_name)}, 'admin')
        on conflict (product_id, alias_norm) do nothing`,
  );
  await db.execute(sql`update unmatched_items set status = 'resolved', resolved_product_id = ${action.productId} where id = ${itemId}`);
}

export { parseSize, productAlias };
