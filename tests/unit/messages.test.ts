import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import xh from '@/messages/xh.json';
import af from '@/messages/af.json';
import { BRAND } from '@/lib/brand';

type Msgs = { [k: string]: string | Msgs };
const keys = (m: Msgs, p = ''): string[] =>
  Object.entries(m).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : keys(v, `${p}${k}.`)));

describe('messages', () => {
  it('xh and af mirror en exactly (run `pnpm tsx scripts/sync-messages.ts`)', () => {
    expect(keys(xh as Msgs).sort()).toEqual(keys(en as Msgs).sort());
    expect(keys(af as Msgs).sort()).toEqual(keys(en as Msgs).sort());
  });
  it('brand name is not hard-coded in en messages (use {brand})', () => {
    const all = JSON.stringify(en);
    expect(all.includes(BRAND.name)).toBe(false);
  });
});
