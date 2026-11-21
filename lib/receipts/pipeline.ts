/**
 * Receipts (RCP-1…6): upload → private blob → async Claude extraction → PII strip → totals check (±2%)
 * → product matching → branch-level price observations (source receipt) → verified savings.
 * Verified savings only count matched lines with a known normal price (RCP-4).
 */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import type { Household } from '@/lib/household';
import { assertCap, claudeTool, ClaudeError, models } from '@/lib/claude';
import { EXTRACTION_TOOL, extractionSchema, totalsMatch, validateLines, type ExtractedLine } from '@/lib/extraction';
import { stripPiiDeep } from './pii';
import { matchProduct } from '@/lib/prices/match';
import { refreshCurrentPrices } from '@/lib/prices/import';
import { normName } from '@/lib/location/normalize';
import { putPrivate } from '@/lib/blob';
import { track } from '@/lib/events';
import { log } from '@/lib/log';
import { isoDateInSA } from '@/lib/period';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_RETENTION_DAYS = 30;

export class ReceiptError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const SYSTEM = `You read South African grocery till slips. Call record_document exactly once with what is printed.
Rules: document_type "receipt". Money in integer cents (R23.99 → 2399). price_cents is the amount charged for the line
(after any special or card discount); was_price_cents only when the slip shows the normal price or a discount for that line.
member_only true when the discount needed a loyalty card. quantity is the number of items on the line.
Skip non-product lines (subtotals, VAT, change, tender, loyalty points, deposits). date is the purchase date (YYYY-MM-DD).
Never include card numbers, phone numbers, or the names of people (cashiers or customers).`;

export async function createReceipt(
  db: Db,
  h: Household,
  file: { bytes: Uint8Array; type: string },
  opts: { consent: boolean },
): Promise<string> {
  if (!h.receiptConsentAt) {
    if (!opts.consent) throw new ReceiptError('consent_required', 'Please agree to how we use your slip first', 403);
    await db.execute(sql`update households set receipt_consent_at = now() where id = ${h.id}::uuid`);
  }
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new ReceiptError('bad_type', 'Upload a JPEG, PNG or WebP photo');
  if (file.bytes.byteLength > MAX_IMAGE_BYTES) throw new ReceiptError('too_large', 'The photo is over 2 MB');
  await assertCap(db, h.id, 'receipt');
  const url = await putPrivate(`receipts/${h.id}/${Date.now()}.${file.type.split('/')[1]}`, file.bytes, file.type);
  const [row] = await query<{ id: string }>(
    db,
    sql`insert into receipts (household_id, image_url, status, image_delete_after)
        values (${h.id}::uuid, ${url}, 'processing', now() + make_interval(days => ${IMAGE_RETENTION_DAYS})) returning id`,
  );
  await track(db, h.id, 'receipt_uploaded');
  return row!.id;
}

/** Which of the household's shops (or which chain) the slip is from. */
async function resolveRetailer(db: Db, h: Household, retailerText: string) {
  const retailers = await query<{ id: string; name: string }>(db, sql`select id, name from retailers`);
  const n = normName(retailerText);
  const r = retailers.find((x) => n.includes(normName(x.name)) || n.includes(x.id)) ?? (/pick n pay|pnp/.test(n) ? retailers.find((x) => x.id === 'pnp') : undefined);
  if (!r) return { retailerId: null, branchId: null };
  const ids = [h.mainBranchId, h.topUpBranchId].filter((x): x is number => x !== null);
  const [b] = ids.length
    ? await query<{ id: string | number }>(db, sql`select id from branches where retailer_id = ${r.id} and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) limit 1`)
    : [];
  return { retailerId: r.id, branchId: b ? Number(b.id) : null };
}

async function normalPrice(db: Db, productId: number, branchId: number | null): Promise<number | null> {
  const [r] = await query<{ price_cents: number }>(
    db,
    sql`select cp.price_cents from current_prices cp join products p on p.id = cp.product_id
        where cp.product_id = ${productId} and (cp.branch_id = ${branchId}::bigint or cp.branch_id is null)
        order by cp.is_fresh desc, (case when cp.is_fresh then cp.trust else 0 end) desc, cp.observed_at desc limit 1`,
  );
  return r ? Number(r.price_cents) : null;
}

export interface ReceiptContext {
  householdId: string;
  imageBase64: string;
  mediaType: (typeof IMAGE_TYPES)[number];
}

export async function processReceipt(db: Db, h: Household, receiptId: string, ctx: ReceiptContext) {
  try {
    const { output } = await claudeTool({
      db,
      purpose: 'receipt',
      householdId: h.id,
      model: models.vision(),
      system: SYSTEM,
      tool: EXTRACTION_TOOL,
      schema: extractionSchema,
      content: [
        { type: 'image', source: { type: 'base64', media_type: ctx.mediaType, data: ctx.imageBase64 } },
        { type: 'text', text: 'Read this till slip.' },
      ],
    });
    return await applyExtraction(db, h, receiptId, output);
  } catch (e) {
    const reason = e instanceof ClaudeError ? e.code : 'error';
    log.warn('receipt_failed', { receiptId, reason, error: String(e) });
    await db.execute(sql`update receipts set status = 'failed', extraction = ${JSON.stringify({ error: reason })}::jsonb where id = ${receiptId}::uuid`);
    return { status: 'failed' as const };
  }
}

/** Everything after extraction (separately testable). */
export async function applyExtraction(db: Db, h: Household, receiptId: string, raw: unknown) {
  const clean = stripPiiDeep(extractionSchema.parse(raw));
  const { lines, rejected } = validateLines(clean.lines);
  const { retailerId, branchId } = await resolveRetailer(db, h, clean.retailer);
  const purchasedOn = clean.date ?? isoDateInSA(new Date());
  const ok = totalsMatch(lines, clean.total_cents);
  const stored = { ...clean, lines, rejected };
  await db.execute(
    sql`update receipts set extraction = ${JSON.stringify(stored)}::jsonb, retailer_id = ${retailerId}, branch_id = ${branchId},
          purchased_on = ${purchasedOn}::date, total_cents = ${clean.total_cents}
        where id = ${receiptId}::uuid`,
  );
  if (!ok) {
    await db.execute(sql`update receipts set status = 'needs_review' where id = ${receiptId}::uuid`);
    return { status: 'needs_review' as const };
  }

  const [batch] = await query<{ id: string | number }>(
    db,
    sql`insert into ingest_batches (kind, retailer_id, status) values ('receipt', ${retailerId}, 'published') returning id`,
  );
  let matched = 0;
  let paid = 0;
  let normal = 0;
  for (const l of lines) {
    const m = await matchProduct(db, retailerId, l.raw_name, l.size_text);
    const unit = Math.round(l.price_cents / l.quantity);
    const norm = m ? (l.was_price_cents ? Math.round(l.was_price_cents / l.quantity) : await normalPrice(db, m.productId, branchId)) : null;
    await db.execute(
      sql`insert into receipt_lines (receipt_id, raw_name, product_id, qty, price_cents, normal_price_cents, match_confidence)
          values (${receiptId}::uuid, ${l.raw_name}, ${m?.productId ?? null}, ${l.quantity}, ${l.price_cents}, ${norm === null ? null : norm * l.quantity}, ${m?.confidence ?? null})`,
    );
    if (!m) {
      await db.execute(
        sql`insert into unmatched_items (batch_id, retailer_id, raw_name, size_text, price_cents) values (${Number(batch!.id)}, ${retailerId}, ${l.raw_name}, ${l.size_text}, ${unit})`,
      );
      continue;
    }
    matched++;
    if (norm !== null) {
      paid += l.price_cents;
      normal += norm * l.quantity;
    }
    if (branchId !== null) await observe(db, h.id, Number(batch!.id), m.productId, branchId, retailerId!, l, unit, norm, purchasedOn);
  }
  const saved = Math.max(0, normal - paid);
  const planId = await linkedPlan(db, h.id, retailerId, purchasedOn);
  await db.execute(
    sql`insert into savings_events (household_id, kind, ref_id, savings_cents, plan_id)
        values (${h.id}::uuid, 'receipt_verified', ${receiptId}, ${saved}, ${planId}::uuid) on conflict (kind, ref_id) do nothing`,
  );
  await db.execute(sql`update receipts set status = 'verified', plan_id = ${planId}::uuid where id = ${receiptId}::uuid`);
  if (branchId !== null) await refreshCurrentPrices(db);
  const matchRate = lines.length ? Math.round((matched / lines.length) * 100) / 100 : 0;
  await track(db, h.id, 'receipt_verified', { savings_cents: saved, match_rate: matchRate });
  return { status: 'verified' as const, savedCents: saved, paidCents: paid, normalCents: normal, matchRate };
}

/** RCP-5: branch-level observation from what the slip shows. */
async function observe(db: Db, householdId: string, batchId: number, productId: number, branchId: number, retailerId: string, l: ExtractedLine, unit: number, norm: number | null, on: string) {
  const shelf = l.was_price_cents ? Math.round(l.was_price_cents / l.quantity) : l.member_only ? norm : unit;
  if (shelf === null) return; // card price without a known shelf price: don't guess
  const member = l.member_only && unit < shelf ? unit : null;
  const special = !l.member_only && unit < shelf ? unit : null;
  await db.execute(
    sql`insert into price_observations (product_id, branch_id, retailer_id, price_cents, member_price_cents, special_price_cents, source, observed_at, ingest_batch_id, household_id)
        values (${productId}, ${branchId}, ${retailerId}, ${shelf}, ${member}, ${special}, 'receipt', ${on}::date + time '12:00', ${batchId}, ${householdId}::uuid)`,
  );
}

/** Same retailer as the plan's shops and bought within the plan's dates (docs/decisions.md). */
async function linkedPlan(db: Db, householdId: string, retailerId: string | null, on: string): Promise<string | null> {
  if (!retailerId) return null;
  const [p] = await query<{ id: string }>(
    db,
    sql`select p.id from plans p
        join branches b on b.id in ((p.request->'shops'->>'mainBranchId')::bigint, nullif(p.request->'shops'->>'topUpBranchId', '')::bigint)
        where p.household_id = ${householdId}::uuid and p.status in ('active', 'shopped') and b.retailer_id = ${retailerId}
          and ${on}::date between p.start_date - 2 and p.start_date + p.days
        order by p.created_at desc limit 1`,
  );
  return p?.id ?? null;
}

export async function receiptView(db: Db, householdId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await query<{ id: string; status: string; retailer_id: string | null; purchased_on: string | null; total_cents: number | null; created_at: string }>(
    db,
    sql`select id, status, retailer_id, purchased_on, total_cents, created_at from receipts where id = ${id}::uuid and household_id = ${householdId}::uuid`,
  );
  if (!r) return null;
  const lines = await query<{ raw_name: string; product_id: number | null; price_cents: number; normal_price_cents: number | null }>(
    db,
    sql`select raw_name, product_id, price_cents, normal_price_cents from receipt_lines where receipt_id = ${id}::uuid order by id`,
  );
  const [ev] = await query<{ savings_cents: number }>(db, sql`select savings_cents from savings_events where kind = 'receipt_verified' and ref_id = ${id}`);
  const counted = lines.filter((l) => l.product_id !== null && l.normal_price_cents !== null);
  return {
    id: r.id,
    status: r.status,
    retailerId: r.retailer_id,
    purchasedOn: r.purchased_on ? String(r.purchased_on).slice(0, 10) : null,
    totalCents: r.total_cents,
    lines: lines.map((l) => ({ rawName: l.raw_name, matched: l.product_id !== null, priceCents: Number(l.price_cents), normalCents: l.normal_price_cents === null ? null : Number(l.normal_price_cents) })),
    verified: ev
      ? {
          paidCents: counted.reduce((s, l) => s + Number(l.price_cents), 0),
          normalCents: counted.reduce((s, l) => s + Number(l.normal_price_cents), 0),
          savedCents: Number(ev.savings_cents),
        }
      : null,
  };
}
