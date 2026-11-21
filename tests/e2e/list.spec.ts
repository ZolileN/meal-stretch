import { expect, test } from '@playwright/test';
import { chooseShop, planSuppers } from './helpers';

test.describe('meal actions, list, pantry (Phase 5)', () => {
  test('plan → swap Tue → tick 3 offline → reload online → ticks persist', async ({ page, context }) => {
    await chooseShop(page, context, /TEST Checkers Somerset West/);
    await planSuppers(page, { people: 4, budget: 900 });

    // Swap Tuesday's supper
    const tue = page.locator('[data-testid^="meal-"]').filter({ hasText: /^Tue|Tue/ }).first();
    const before = await tue.textContent();
    // Meal actions are always visible on the card now (THEME §3 meal card).
    await tue.getByRole('button', { name: 'Swap' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByTestId('swap-option')).toHaveCount(3);
    await expect(sheet.getByTestId('swap-option').first()).toContainText(/cheaper|more|same price/);
    const chosen = ((await sheet.getByTestId('swap-option').first().locator('.font-semibold').first().textContent()) ?? '').trim();
    await sheet.getByRole('button', { name: 'Choose' }).first().click();
    await expect(page.getByTestId('notice')).toHaveText('Supper swapped.');
    await expect(page.locator('[data-testid^="meal-"]').filter({ hasText: chosen })).toHaveCount(1);
    expect(await page.locator('[data-testid^="meal-"]').filter({ hasText: /Tue/ }).first().textContent()).not.toBe(before);

    // Shopping list: tick 3 items while offline
    await page.getByRole('link', { name: /See shopping list/ }).click();
    await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();
    const footer = page.getByTestId('list-footer');
    await expect(footer).toContainText(/Total R[\d,.]+ · 0\/\d+ ticked/);
    await context.setOffline(true);
    await expect(page.getByText("You're offline.", { exact: false })).toBeVisible();
    const boxes = page.getByRole('checkbox', { name: /^Tick / });
    for (let i = 0; i < 3; i++) await boxes.nth(i).check();
    await expect(footer).toContainText(/ · 3\/\d+ ticked/);

    // Back online → reload → ticks persist (synced from IndexedDB to the server)
    await context.setOffline(false);
    await page.reload();
    await expect(footer).toContainText(/ · 3\/\d+ ticked/);
    const server = await page.evaluate(async () => {
      const latest = await (await fetch('/api/plans/latest')).json();
      const ticks = await (await fetch(`/api/plans/${latest.plan.id}/ticks`)).json();
      return (ticks.ticks as { ticked: boolean }[]).filter((t) => t.ticked).length;
    });
    expect(server).toBe(3);
  });

  test('list: tags, source + date, staples toggle, "Already have it", WhatsApp, mark shopped', async ({ page, context }) => {
    await chooseShop(page, context, /TEST Checkers Somerset West/, { card: /Xtra Savings · I have this card/ });
    await planSuppers(page, { people: 2, budget: 900 });
    await page.goto('/list');
    await expect(page.getByTestId('list-line').first()).toContainText(/Catalogue price, \d{1,2} \w{3}/);
    await page.getByText('Pantry staples (oil, salt, spices)').click();
    await expect(page.getByTestId('staples')).toContainText(/Staples subtotal R/);
    const share = page.getByRole('link', { name: 'Send list on WhatsApp' });
    expect(await share.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=Shopping%20list/);

    const footer = page.getByTestId('list-footer');
    const count = Number(/\/(\d+) ticked/.exec((await footer.textContent()) ?? '')![1]);
    // "Already have it" sits behind the row's chevron (THEME §2.13 ListRow).
    await page.getByTestId('list-line').first().getByRole('button', { name: /^More for / }).click();
    await page.getByRole('button', { name: 'Already have it' }).first().click();
    await expect(page.getByRole('status')).toContainText('Moved to your pantry');
    await expect(footer).toContainText(new RegExp(`/${count - 1} ticked`));

    const boxes = page.getByRole('checkbox', { name: /^Tick / });
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).check();
    await page.getByTestId('shopped-prompt').getByRole('button', { name: 'Mark as shopped' }).click();
    await expect(page.getByRole('status')).toContainText('Shop marked as done');
  });
});
