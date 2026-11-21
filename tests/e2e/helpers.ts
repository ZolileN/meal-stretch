import { expect, type BrowserContext, type Page } from '@playwright/test';

export const SOMERSET_WEST = { latitude: -34.0772, longitude: 18.8461 };

/** O1 + O2: mocked location in Somerset West, pick a shop, continue to O3. */
export async function chooseShop(page: Page, context: BrowserContext, shop: RegExp, opts: { card?: RegExp } = {}) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(SOMERSET_WEST);
  await page.goto('/start');
  await page.getByRole('button', { name: 'Use my current location' }).click();
  await page.getByRole('button', { name: shop }).first().click();
  if (opts.card) await page.getByRole('button', { name: opts.card }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/start\/household$/);
}

/** O3: people, budget, period → plan. */
export async function planSuppers(page: Page, opts: { people?: number; budget: number; period?: RegExp; avoid?: string[] }) {
  for (let i = 1; i < (opts.people ?? 1); i++) await page.getByRole('button', { name: 'More people' }).click();
  await page.getByLabel('How much for suppers?').fill(String(opts.budget));
  if (opts.period) await page.getByRole('button', { name: opts.period }).click();
  for (const a of opts.avoid ?? []) await page.getByRole('button', { name: a, exact: true }).click();
  await page.getByRole('button', { name: 'Plan my suppers' }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByTestId('plan-header')).toBeVisible();
}

export async function currentPlan(page: Page) {
  const html = await page.request.get('/api/household');
  expect(html.ok()).toBe(true);
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/plans/latest');
    return r.ok ? r.json() : null;
  });
  return res as { plan: { id: string }; result: { totals: { paidCents: number; items: number }; basket: { packs: number; unitCents: number }[]; unpriced: unknown[]; meals: unknown[] } } | null;
}
