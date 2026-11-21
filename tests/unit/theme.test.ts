/** docs/THEME.md §1 + §7.6: token contrast (WCAG AA) and "no hard-coded colours in components". */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND, COLORS, TEXT_PAIRS } from '@/lib/brand';
import { contrastRatio } from '@/lib/contrast';
import config from '@/tailwind.config';

describe('contrast', () => {
  it('matches known reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });

  it.each(TEXT_PAIRS)('$fg on $bg meets $min:1 ($use)', ({ fg, bg, min }) => {
    expect(contrastRatio(COLORS[fg], COLORS[bg])).toBeGreaterThanOrEqual(min);
  });

  it('matches the ratios checked in THEME.md', () => {
    const r = (fg: keyof typeof COLORS, bg: keyof typeof COLORS) => Math.round(contrastRatio(COLORS[fg], COLORS[bg]) * 10) / 10;
    expect(r('text', 'bg')).toBeCloseTo(14.9, 0);
    expect(r('primary', 'bg')).toBeCloseTo(8.8, 0);
    expect(r('on-primary', 'primary')).toBeCloseTo(9.6, 0);
    expect(r('savings-text', 'savings-soft')).toBeGreaterThanOrEqual(5.2);
  });

  it('bright savings amber fails as text on light backgrounds (so it is fills/icons only)', () => {
    for (const bg of ['bg', 'surface', 'savings-soft'] as const) expect(contrastRatio(COLORS.savings, COLORS[bg])).toBeLessThan(4.5);
  });
});

describe('tokens', () => {
  it('Tailwind colours are exactly the brand tokens, as CSS variables', () => {
    const colors = config.theme.extend.colors as Record<string, string>;
    expect(Object.keys(colors).sort()).toEqual(Object.keys(COLORS).sort());
    for (const [k, v] of Object.entries(colors)) expect(v).toBe(`var(--ms-${k})`);
    expect(Object.values(COLORS).every((h) => /^#[0-9A-F]{6}$/.test(h))).toBe(true);
    expect(BRAND.colors).toBe(COLORS);
  });
});

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(f) ? [p] : [];
  });

describe('components use tokens only', () => {
  const files = [...walk('components'), ...walk('app')].filter((f) => !f.endsWith('manifest.ts'));
  const PALETTE = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|accent|decoration|placeholder|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;

  it.each(files)('%s has no hex colours or raw Tailwind palette classes', (f) => {
    const src = readFileSync(f, 'utf8');
    expect(src.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g) ?? []).toEqual([]);
    expect(src.match(new RegExp(PALETTE.source, 'g')) ?? []).toEqual([]);
  });

  it('never uses bright savings amber for text (text-savings-text instead)', () => {
    for (const f of files) expect(readFileSync(f, 'utf8').match(/\btext-savings(?![-\w])/g) ?? [], f).toEqual([]);
  });
});
