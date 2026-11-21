import { expect, test } from '@playwright/test';
import { chooseShop, planSuppers } from './helpers';

test.describe('savings, PWA, push (Phase 6)', () => {
  test('lifetime savings go up after marking a shop as done; steal of the week; push explained first', async ({ page, context }) => {
    // Headless Chromium always reports Notification.permission = 'denied'; emulate a fresh phone ('default').
    await context.addInitScript(() => Object.defineProperty(Notification, 'permission', { get: () => 'default' }));
    await chooseShop(page, context, /TEST Checkers Somerset West/, { card: /Xtra Savings · I have this card/ });
    await planSuppers(page, { people: 4, budget: 900 });
    await expect(page.getByTestId('steal')).toContainText(/Steal of the week/i);

    // Push: card → explanation (never the browser prompt first)
    await expect(page.getByTestId('push-card')).toBeVisible();
    await page.getByTestId('push-card').getByRole('button', { name: 'Tell me more' }).click();
    await expect(page.getByTestId('push-explain')).toContainText('never between 8pm and 7am');

    await page.goto('/savings');
    await expect(page.getByTestId('lifetime')).toContainText(/You've saved R0 with /);

    const savings = await page.evaluate(async () => {
      const latest = await (await fetch('/api/plans/latest')).json();
      await fetch(`/api/plans/${latest.plan.id}/shopped`, { method: 'POST' });
      await fetch(`/api/plans/${latest.plan.id}/shopped`, { method: 'POST' }); // idempotent
      return latest.result.totals.savingsCents as number;
    });
    await page.reload();
    const rands = (savings / 100).toFixed(2).replace(/\.00$/, '');
    await expect(page.getByTestId('lifetime')).toContainText(`You've saved R${rands} with`);
    await expect(page.getByRole('link', { name: 'Scan a receipt' })).toBeVisible();
  });

  test('installable PWA manifest from brand settings', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/plan');
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect((await request.get('/icons/icon-512.png')).ok()).toBe(true);
    expect((await request.get('/sw.js')).ok()).toBe(true);
  });
});
