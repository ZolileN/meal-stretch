import { expect, test } from '@playwright/test';
import { chooseShop, planSuppers } from './helpers';

test('service worker serves the plan and list offline (§15)', async ({ page, context }) => {
  await chooseShop(page, context, /TEST Checkers Somerset West/);
  await planSuppers(page, { people: 2, budget: 900 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Visit both pages once online so the network-first strategy caches them.
  await page.goto('/list');
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();
  await page.goto('/plan');
  await expect(page.getByTestId('plan-header')).toBeVisible();

  await context.setOffline(true);
  await page.goto('/list');
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();
  await page.goto('/plan');
  await expect(page.getByTestId('plan-header')).toBeVisible();
  await context.setOffline(false);
});
