/**
 * POPIA (RCP-6): strip personal data before anything is stored: card numbers, phone numbers, emails,
 * ID numbers and names printed on slips (cashier/customer/member lines).
 */
const CARD = /\b\d(?:[ -]?\d){11,18}\b|(?:\*{2,}|x{2,}|X{2,}|#{2,})[ -]?\d{2,4}\b/g;
const PHONE = /(?:\+27|\b0)(?:[\s-]?\d){9}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SA_ID = /\b\d{13}\b/g;
const NAMED = /\b(cashier|teller|operator|served by|customer|member|card ?holder|name)\b\s*[:#-]?\s*[A-Za-z][A-Za-z.' -]{1,40}/gi;

export function stripPii(text: string): string {
  return text
    .replace(EMAIL, '[removed]')
    .replace(NAMED, (_m, label: string) => `${label}: [removed]`)
    .replace(CARD, '[removed]')
    .replace(PHONE, '[removed]')
    .replace(SA_ID, '[removed]')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Deep-strip every string in an extraction before storing it. */
export function stripPiiDeep<T>(v: T): T {
  if (typeof v === 'string') return stripPii(v) as T;
  if (Array.isArray(v)) return v.map(stripPiiDeep) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripPiiDeep(x)])) as T;
  return v;
}
