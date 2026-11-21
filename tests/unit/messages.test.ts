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

import { readFileSync } from 'node:fs';
describe('runtime messages (generated)', () => {
  it('are in sync with the sources and never contain TODO markers', () => {
    for (const loc of ['en', 'xh', 'af']) {
      const rt = JSON.parse(readFileSync(`messages/runtime/${loc}.json`, 'utf8'));
      expect(keys(rt).sort()).toEqual(keys(en as Msgs).sort());
      expect(JSON.stringify(rt)).not.toContain('TODO:');
    }
    expect(JSON.parse(readFileSync('messages/runtime/en.json', 'utf8'))).toEqual(en);
  });
});

import { parse } from '@formatjs/icu-messageformat-parser';
describe('every message is valid ICU (what next-intl precompiles at build)', () => {
  const flat = (m: Msgs, p = ''): [string, string][] =>
    Object.entries(m).flatMap(([k, v]) => (typeof v === 'string' ? [[p + k, v] as [string, string]] : flat(v, `${p}${k}.`)));
  for (const loc of ['en', 'xh', 'af']) {
    it(`${loc}: parses (e.g. no "<file>" text, which ICU reads as an unclosed tag)`, () => {
      const rt = JSON.parse(readFileSync(`messages/runtime/${loc}.json`, 'utf8')) as Msgs;
      const bad = flat(rt).filter(([, v]) => {
        try {
          parse(v);
          return false;
        } catch {
          return true;
        }
      });
      expect(bad.map(([k]) => k)).toEqual([]);
    });
  }
});
