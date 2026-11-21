/**
 * The only place the product name lives (besides messages/*.json).
 * Components must use BRAND, never a hard-coded name.
 */
export const BRAND = {
  name: 'MealStretch',
  shortName: 'MealStretch',
  tagline: 'Stretch the rand to every meal.',
  storeTitle: 'MealStretch: Budget Meal Planner',
  colors: {
    primary: '#0f766e', // teal-700
    primaryDark: '#115e59',
    accent: '#f59e0b', // amber-500
    danger: '#b91c1c',
    background: '#ffffff',
    text: '#111827',
  },
} as const;

export type Brand = typeof BRAND;
