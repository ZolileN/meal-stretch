/**
 * Money helpers. All money is integer cents (CLAUDE.md). Format only at the edge.
 */
export type Cents = number;

export class MoneyError extends Error {
  override name = 'MoneyError';
}

/** Throws unless `n` is a safe integer number of cents. Returns it for chaining. */
export function assertCents(n: unknown, label = 'value'): Cents {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new MoneyError(`${label} must be integer cents, got ${String(n)}`);
  }
  return n;
}

export function isCents(n: unknown): n is Cents {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

export interface FormatOptions {
  /** 'always' → R58.00, 'auto' → R58 when whole rands else R58.50 */
  decimals?: 'always' | 'auto';
  /** Prefix positive values with '+' (for deltas). */
  signed?: boolean;
}

/** formatRand(123450) → "R1,234.50"; formatRand(-500) → "-R5.00". */
export function formatRand(cents: Cents, opts: FormatOptions = {}): string {
  assertCents(cents, 'cents');
  const decimals = opts.decimals ?? 'always';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const rands = Math.floor(abs / 100);
  const rem = abs % 100;
  const randsStr = rands.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = decimals === 'auto' && rem === 0 ? '' : '.' + rem.toString().padStart(2, '0');
  const sign = neg ? '-' : opts.signed && cents > 0 ? '+' : '';
  return `${sign}R${randsStr}${frac}`;
}

/** Short form for headlines: whole rands when possible ("R406", "R79.99"). */
export function formatRandShort(cents: Cents, opts: Omit<FormatOptions, 'decimals'> = {}): string {
  return formatRand(cents, { ...opts, decimals: 'auto' });
}

const MONEY_RE = /^(-)?\s*R?\s*(\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.(\d{1,2}))?$/i;

/**
 * Parse a rand string into cents: "R1,234.50" → 123450, "12" → 1200, "-R5" → -500, "R 1 234.5" → 123450.
 * Rejects more than two decimal places, comma decimals and garbage (returns null).
 */
export function parseRand(input: string): Cents | null {
  const s = input.trim().replace(/−/g, '-');
  const m = MONEY_RE.exec(s);
  if (!m) return null;
  const whole = Number((m[2] ?? '').replace(/[ ,]/g, ''));
  const frac = m[3] ? Number(m[3].padEnd(2, '0')) : 0;
  const cents = whole * 100 + frac;
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] ? -cents : cents;
}

/** Integer rands → cents. */
export function randsToCents(rands: number): Cents {
  if (!Number.isSafeInteger(rands)) throw new MoneyError(`rands must be an integer, got ${rands}`);
  return rands * 100;
}

/**
 * Parse a decimal price string such as "79.99" (CSV cells) into cents without float maths.
 */
export function parseDecimalToCents(input: string): Cents | null {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const cents = Number(m[2]) * 100 + (m[3] ? Number(m[3].padEnd(2, '0')) : 0);
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] ? -cents : cents;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return assertCents(total, 'sum');
}

/** Integer division rounded half away from zero; for per-plate and pro-rata values. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new MoneyError('division by zero');
  const q = numerator / denominator;
  return q < 0 ? -Math.round(-q) : Math.round(q);
}

/** Whole-number percentage of part over whole (0 when whole is 0). */
export function percent(part: Cents, whole: Cents): number {
  if (whole === 0) return 0;
  return divRound(part * 100, whole);
}
