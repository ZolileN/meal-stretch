/**
 * The only place the product name and brand values live (besides messages/*.json).
 * Components must use BRAND and the Tailwind tokens built from it (tailwind.config.ts), never a
 * hard-coded name or hex value. Theme: docs/THEME.md.
 */

/** Design tokens (docs/THEME.md §1). Keys are the Tailwind colour names: `bg-surface`, `text-savings-text`, … */
export const COLORS = {
  bg: '#FBF4EE',
  surface: '#FFFFFF',
  'surface-muted': '#F3EAE2',
  border: '#E9DED4',
  primary: '#1E4D3B',
  'primary-hover': '#173D2F',
  'primary-soft': '#2F6B52',
  /** Text and icons on primary / primary-soft / accent / danger fills. */
  'on-primary': '#FFFFFF',
  accent: '#A6532E',
  /** Signature amber: fills, rings and icons only. Never text on light backgrounds (2.6:1). */
  savings: '#C98A1B',
  'savings-text': '#8A5A0F',
  'savings-soft': '#FBEFD6',
  text: '#22201E',
  'text-muted': '#6E655D',
  danger: '#B3261E',
  'danger-soft': '#FBE7E5',
  success: '#2E7D4F',
  info: '#2F5DA8',
} as const;

export type ColorToken = keyof typeof COLORS;

/** Text/background pairs the UI uses, with the WCAG minimum each must meet (tests/unit/theme.test.ts). */
export const TEXT_PAIRS: { fg: ColorToken; bg: ColorToken; min: 4.5 | 3; use: string }[] = [
  { fg: 'text', bg: 'bg', min: 4.5, use: 'body on cream' },
  { fg: 'text', bg: 'surface', min: 4.5, use: 'body on cards' },
  { fg: 'text', bg: 'surface-muted', min: 4.5, use: 'body on muted panels' },
  { fg: 'text-muted', bg: 'bg', min: 4.5, use: 'captions on cream' },
  { fg: 'text-muted', bg: 'surface', min: 4.5, use: 'captions on cards' },
  { fg: 'text-muted', bg: 'savings-soft', min: 4.5, use: 'captions in savings panels' },
  { fg: 'primary', bg: 'bg', min: 4.5, use: 'headings and links on cream' },
  { fg: 'primary', bg: 'surface', min: 4.5, use: 'headings and links on cards' },
  { fg: 'primary', bg: 'surface-muted', min: 4.5, use: 'selected chips' },
  { fg: 'primary', bg: 'savings-soft', min: 4.5, use: 'headings in savings panels' },
  { fg: 'on-primary', bg: 'primary', min: 4.5, use: 'primary buttons, nav, hero' },
  { fg: 'on-primary', bg: 'primary-hover', min: 4.5, use: 'pressed buttons' },
  { fg: 'on-primary', bg: 'primary-soft', min: 4.5, use: 'active nav pill' },
  { fg: 'on-primary', bg: 'accent', min: 4.5, use: 'count badges' },
  { fg: 'on-primary', bg: 'danger', min: 4.5, use: 'danger buttons' },
  { fg: 'accent', bg: 'surface', min: 4.5, use: 'terracotta highlights on cards' },
  { fg: 'accent', bg: 'bg', min: 4.5, use: 'onboarding eyebrow on cream' },
  { fg: 'savings-text', bg: 'savings-soft', min: 4.5, use: 'SavingsChip' },
  { fg: 'savings-text', bg: 'surface', min: 4.5, use: 'savings figures on cards' },
  { fg: 'savings-text', bg: 'bg', min: 4.5, use: 'savings figures on cream' },
  { fg: 'danger', bg: 'danger-soft', min: 4.5, use: 'over-budget panel' },
  { fg: 'danger', bg: 'surface', min: 4.5, use: 'errors on cards' },
  { fg: 'danger', bg: 'bg', min: 4.5, use: 'errors on cream' },
  { fg: 'success', bg: 'surface', min: 4.5, use: 'under-budget status' },
  { fg: 'info', bg: 'surface', min: 4.5, use: 'MEAL PLAN tag' },
];

export const BRAND = {
  name: 'MealStretch',
  shortName: 'MealStretch',
  tagline: 'Stretch the rand to every meal.',
  storeTitle: 'MealStretch: Budget Meal Planner',
  colors: COLORS,
  radius: { card: '24px', input: '16px', pill: '999px', image: '16px', sheet: '28px' },
  shadow: {
    card: '0 1px 2px rgba(60,40,20,0.06), 0 4px 14px rgba(60,40,20,0.06)',
    float: '0 8px 24px rgba(30,77,59,0.25)',
  },
} as const;

export type Brand = typeof BRAND;
