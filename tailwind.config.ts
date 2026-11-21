/**
 * Design tokens for Tailwind (docs/THEME.md §1), loaded from app/globals.css with `@config`.
 * Colours come from lib/brand.ts and are exposed as CSS variables on :root, so a dark theme can be
 * added later by overriding the variables only (light mode only for the MVP).
 */
import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { BRAND, COLORS } from './lib/brand';

const names = Object.keys(COLORS) as (keyof typeof COLORS)[];

export default {
  content: [],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, `var(--ms-${n})`])),
      borderRadius: {
        card: BRAND.radius.card,
        input: BRAND.radius.input,
        pill: BRAND.radius.pill,
        img: BRAND.radius.image,
        sheet: BRAND.radius.sheet,
      },
      boxShadow: { card: BRAND.shadow.card, float: BRAND.shadow.float },
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        display: ['1.75rem', { lineHeight: '2.125rem' }],
        h1: ['1.5rem', { lineHeight: '1.875rem' }],
        h2: ['1.25rem', { lineHeight: '1.625rem' }],
        h3: ['1.0625rem', { lineHeight: '1.375rem' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        small: ['0.875rem', { lineHeight: '1.25rem' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
      },
      spacing: { gutter: '1.25rem' },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': Object.fromEntries(names.map((n) => [`--ms-${n}`, COLORS[n]])) });
    }),
  ],
} satisfies Config;
