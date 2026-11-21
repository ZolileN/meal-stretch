/** CSV price import: parsing + per-row Zod validation (pure). DB writes live in lib/prices/import.ts. */
import { z } from 'zod';
import { PROVINCE_CODES } from '@/lib/location/provinces';

export const CSV_COLUMNS = [
  'retailer_id', 'branch_id', 'product_name', 'brand', 'pack_qty', 'pack_unit', 'ingredient_id', 'price_cents',
  'member_price_cents', 'special_price_cents', 'special_ends_on', 'observed_at',
] as const;

/** Minimal RFC 4180 parser; lines starting with '#' are comments. */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const out: { line: number; cells: string[] }[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const startLine = i + 1;
    let raw = lines[i] ?? '';
    i++;
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    // join continuation lines while inside quotes
    while ((raw.match(/"/g)?.length ?? 0) % 2 === 1 && i < lines.length) raw += '\n' + lines[i++];
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let k = 0; k < raw.length; k++) {
      const ch = raw[k]!;
      if (q) {
        if (ch === '"' && raw[k + 1] === '"') {
          cur += '"';
          k++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    out.push({ line: startLine, cells: cells.map((c) => c.trim()) });
  }
  return out;
}

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const intCents = z
  .string()
  .regex(/^\d+$/, 'must be whole cents (e.g. 7999)')
  .transform(Number)
  .pipe(z.number().int().positive('must be > 0').max(500_000, 'must be ≤ R5,000'));
const optCents = z.preprocess(blankToNull, intCents.nullable());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const csvRowSchema = z
  .object({
    retailer_id: z.string().regex(/^[a-z_]{2,30}$/, 'unknown retailer id format'),
    branch_id: z.preprocess(blankToNull, z.string().regex(/^\d+$/).transform(Number).nullable()),
    /** Optional column: a province code (EC, WC, GP, KZN, …) for regional prices; blank or absent = national. */
    province: z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase()) : v ?? null), z.enum(PROVINCE_CODES, { message: `must be one of ${PROVINCE_CODES.join(', ')} or blank` }).nullable()),
    product_name: z.string().min(2).max(200),
    brand: z.preprocess(blankToNull, z.string().max(80).nullable()),
    pack_qty: z.string().regex(/^\d+(\.\d+)?$/, 'must be a number'),
    pack_unit: z.enum(['g', 'ml', 'unit', 'kg', 'l', 'each'], { message: 'must be g, ml, unit, kg, l or each' }),
    ingredient_id: z.preprocess(blankToNull, z.string().regex(/^[a-z0-9_]{2,60}$/).nullable()),
    price_cents: intCents,
    member_price_cents: optCents,
    special_price_cents: optCents,
    special_ends_on: z.preprocess(blankToNull, isoDate.nullable()),
    /** Optional column: the page the price was found on (guide prices). */
    source_url: z.preprocess((v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v ?? null), z.string().regex(/^https?:\/\/\S+$/, 'must be an http(s) URL').max(1000).nullable()),
    observed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, 'must be an ISO date or datetime'),
  })
  .transform((r, ctx) => {
    // normalise units to integer g / ml / unit
    let unit: 'g' | 'ml' | 'unit' = r.pack_unit === 'kg' ? 'g' : r.pack_unit === 'l' ? 'ml' : r.pack_unit === 'each' ? 'unit' : r.pack_unit;
    const factor = r.pack_unit === 'kg' || r.pack_unit === 'l' ? 1000 : 1;
    const [w, f = ''] = r.pack_qty.split('.');
    const scaled = Number(w) * factor + (f ? Number(f.padEnd(3, '0').slice(0, 3)) * (factor / 1000) : 0);
    if (!Number.isSafeInteger(scaled) || scaled <= 0) {
      ctx.addIssue({ code: 'custom', path: ['pack_qty'], message: 'must be a positive whole number of g, ml or units' });
      return z.NEVER;
    }
    unit = unit as 'g' | 'ml' | 'unit';
    return { ...r, pack_qty: scaled, pack_unit: unit };
  })
  .superRefine((r, ctx) => {
    if (r.branch_id !== null && r.province !== null)
      ctx.addIssue({ code: 'custom', path: ['province'], message: 'use branch_id or province, not both' });
    if (r.special_price_cents !== null && r.special_price_cents >= r.price_cents)
      ctx.addIssue({ code: 'custom', path: ['special_price_cents'], message: 'special must be below the shelf price' });
    if (r.member_price_cents !== null && r.member_price_cents >= r.price_cents)
      ctx.addIssue({ code: 'custom', path: ['member_price_cents'], message: 'member price must be below the shelf price' });
  });

export type CsvRow = z.output<typeof csvRowSchema>;
export interface RejectedRow {
  line: number;
  reasons: string[];
}

export function validateCsv(text: string, now: Date = new Date()): { rows: (CsvRow & { line: number })[]; rejected: RejectedRow[] } {
  const parsed = parseCsv(text);
  const rows: (CsvRow & { line: number })[] = [];
  const rejected: RejectedRow[] = [];
  const header = parsed.shift();
  if (!header) return { rows, rejected: [{ line: 1, reasons: ['empty file'] }] };
  const missing = CSV_COLUMNS.filter((c) => !header.cells.includes(c));
  if (missing.length) return { rows, rejected: [{ line: header.line, reasons: [`missing columns: ${missing.join(', ')}`] }] };
  const maxFuture = now.getTime() + 24 * 3600 * 1000;
  for (const { line, cells } of parsed) {
    if (cells.length !== header.cells.length) {
      rejected.push({ line, reasons: [`expected ${header.cells.length} columns, got ${cells.length}`] });
      continue;
    }
    const obj = Object.fromEntries(header.cells.map((h, i) => [h, cells[i] ?? '']));
    const r = csvRowSchema.safeParse(obj);
    if (!r.success) {
      const reasons = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      // Zod skips cross-field checks when a field fails; report them too so one pass finds every problem.
      const num = (k: string) => (/^\d+$/.test(obj[k] ?? '') ? Number(obj[k]) : null);
      const price = num('price_cents');
      if (price !== null) {
        const sp = num('special_price_cents');
        const mp = num('member_price_cents');
        if (sp !== null && sp >= price && !reasons.some((x) => x.startsWith('special_price_cents')))
          reasons.push('special_price_cents: special must be below the shelf price');
        if (mp !== null && mp >= price && !reasons.some((x) => x.startsWith('member_price_cents')))
          reasons.push('member_price_cents: member price must be below the shelf price');
      }
      rejected.push({ line, reasons });
      continue;
    }
    if (new Date(r.data.observed_at).getTime() > maxFuture) {
      rejected.push({ line, reasons: ['observed_at: is in the future'] });
      continue;
    }
    rows.push({ ...r.data, line });
  }
  return { rows, rejected };
}
