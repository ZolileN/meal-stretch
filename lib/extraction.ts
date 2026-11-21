/** PRD §10.4 extraction schema (leaflets + receipts): tool input_schema + Zod validation. */
import { z } from 'zod';
import type { ToolSpec } from './claude';

export const EXTRACTION_TOOL: ToolSpec = {
  name: 'record_document',
  description: 'Record the products, prices and totals read from a South African grocery till slip or specials leaflet.',
  input_schema: {
    type: 'object',
    required: ['document_type', 'retailer', 'lines'],
    properties: {
      document_type: { enum: ['leaflet', 'receipt'] },
      retailer: { type: 'string' },
      branch_text: { type: ['string', 'null'] },
      date: { type: ['string', 'null'], description: 'ISO date of purchase or leaflet start' },
      valid_until: { type: ['string', 'null'] },
      total_cents: { type: ['integer', 'null'] },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          required: ['raw_name', 'price_cents'],
          properties: {
            raw_name: { type: 'string' },
            size_text: { type: ['string', 'null'] },
            quantity: { type: 'number', default: 1 },
            price_cents: { type: 'integer' },
            was_price_cents: { type: ['integer', 'null'] },
            member_only: { type: 'boolean', default: false },
            confidence: { type: 'number' },
          },
        },
      },
    },
  },
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Document envelope; lines are validated one by one so one bad line doesn't sink the slip. */
export const extractionSchema = z.object({
  document_type: z.enum(['leaflet', 'receipt']),
  retailer: z.string().trim().min(1).max(80),
  branch_text: z.string().max(200).nullable().optional().default(null),
  date: isoDate.nullable().optional().default(null),
  valid_until: isoDate.nullable().optional().default(null),
  total_cents: z.number().int().nonnegative().max(10_000_000).nullable().optional().default(null),
  lines: z.array(z.unknown()).max(300),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** §10.4: reject lines where price_cents ≤ 0 or > R5,000. */
export const lineSchema = z.object({
  raw_name: z.string().trim().min(1).max(120),
  size_text: z.string().max(40).nullable().optional().default(null),
  quantity: z.number().positive().max(100).optional().default(1),
  price_cents: z.number().int().positive('price must be > 0').max(500_000, 'price must be ≤ R5,000'),
  was_price_cents: z.number().int().positive().max(500_000).nullable().optional().default(null),
  member_only: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});
export type ExtractedLine = z.infer<typeof lineSchema>;

export function validateLines(lines: unknown[]): { lines: ExtractedLine[]; rejected: { index: number; reasons: string[] }[] } {
  const ok: ExtractedLine[] = [];
  const rejected: { index: number; reasons: string[] }[] = [];
  lines.forEach((l, index) => {
    const r = lineSchema.safeParse(l);
    if (r.success) ok.push(r.data);
    else rejected.push({ index, reasons: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  });
  return { lines: ok, rejected };
}

/** Receipt totals check (§10.4): Σ lines within 2% of total_cents, else needs_review. */
export function totalsMatch(lines: ExtractedLine[], totalCents: number | null): boolean {
  if (totalCents === null || totalCents === 0) return false;
  const sum = lines.reduce((s, l) => s + l.price_cents, 0);
  return Math.abs(sum - totalCents) <= totalCents * 0.02;
}
