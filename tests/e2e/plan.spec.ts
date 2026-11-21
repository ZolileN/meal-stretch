import { expect, test } from '@playwright/test';
import { chooseShop, currentPlan, planSuppers } from './helpers';

test.describe('onboarding + plan screen (Phase 4)', () => {
  test('first run: location → shops → household → plan (≤ 3 screens after location)', async ({ page, context }) => {
    await chooseShop(page, context, /TEST Checkers Somerset West/, { card: /Xtra Savings · I have this card/ }); // screen 1 (O2)
    await expect(page.getByRole('heading', { name: 'Who and how much?' })).toBeVisible(); // screen 2 (O3)
    await planSuppers(page, { people: 4, budget: 800, period: /^7 days$/ }); // screen 3 (P1)

    const header = page.getByTestId('plan-header');
    await expect(header.getByRole('heading', { level: 1 })).toHaveText(/^7 suppers · R[\d,.]+ a plate$/);
    await expect(header).toContainText(/R[\d,.]+ at Checkers/);
    await expect(page.getByTestId('plan-savings')).toContainText(/You save R[\d,.]+ \(\d+%\)/);
    await expect(page.getByTestId('budget-status')).toContainText(/left of your R800/);
    await expect(header).toContainText(/Prices checked \d{1,2} \w{3}/);
    await expect(page.getByRole('link', { name: /See shopping list · \d+ items/ })).toBeVisible();
    await expect(page.getByText(/^Tonight · /)).toBeVisible();
    for (let d = 1; d <= 7; d++) await expect(page.getByTestId(`meal-${d}`)).toBeVisible();

    // Home is the plan at a glance now (THEME §3): summary card + Tonight hero, and the location bar (LOC-6).
    await page.goto('/');
    await expect(page.getByTestId('plan-header')).toBeVisible();
    await expect(page.getByTestId('tonight-hero')).toContainText(/R[\d,.]+\/plate/);
    await expect(page.getByTestId('location-bar')).toContainText('Shopping near Somerset West');
  });

  test('over budget → red status → Fit my budget → offer fewer suppers', async ({ page, context }) => {
    await chooseShop(page, context, /TEST Checkers Somerset West/);
    await planSuppers(page, { people: 1, budget: 250 });
    await expect(page.getByTestId('budget-status')).toContainText(/R[\d,.]+ over your R250/);
    await page.getByRole('button', { name: 'Fit my budget' }).click();
    await expect(page.getByText(/R250 covers \d suppers\. Want \d instead of 7\?/)).toBeVisible();
    const offer = page.getByRole('button', { name: /^Plan \d suppers$/ });
    const label = (await offer.textContent()) ?? '';
    const days = Number(/\d+/.exec(label)?.[0]);
    await offer.click();
    await expect(page.getByTestId('plan-header').getByRole('heading', { level: 1 })).toHaveText(new RegExp(`^${days} suppers`));
    await expect(page.getByTestId('budget-status')).toContainText(/left of your R250/);
  });

  test('unpriced items are listed and excluded from totals', async ({ page, context }) => {
    await chooseShop(page, context, /TEST Usave Somerset West/);
    await planSuppers(page, { people: 2, budget: 900 });
    const unpriced = page.getByTestId('unpriced');
    await expect(unpriced).toContainText(/\d+ items? we can't price yet/);
    await unpriced.locator('summary').click();
    await expect(unpriced).toContainText('Not included in the total. We never guess prices.');
    const plan = await currentPlan(page);
    expect(plan).not.toBeNull();
    const sum = plan!.result.basket.reduce((s, l) => s + l.packs * l.unitCents, 0);
    expect(plan!.result.totals.paidCents).toBe(sum);
    expect(plan!.result.unpriced.length).toBeGreaterThan(0);
    const n = Number(/(\d+) items?/.exec((await unpriced.locator('summary').textContent()) ?? '')?.[1]);
    expect(n).toBe(plan!.result.unpriced.length);

    // They are still on the shopping list: counted, with the amount needed, tickable, no price.
    await expect(page.getByRole('link', { name: new RegExp(`See shopping list · ${plan!.result.totals.items + n} items`) })).toBeVisible();
    await page.goto('/list');
    const lines = page.getByTestId('list-line-unpriced');
    await expect(lines).toHaveCount(n);
    await expect(lines.first()).toContainText(/needed/);
    await expect(lines.first()).toContainText('No price yet');
    const footer = page.getByTestId('list-footer');
    const before = /(\d+)\/(\d+) ticked/.exec((await footer.textContent()) ?? '')!;
    await lines.first().getByRole('checkbox').check();
    await expect(footer).toContainText(`${Number(before[1]) + 1}/${before[2]} ticked`);
  });
});

test('natural-language tweak re-plans without fish (fixture mode without an API key)', async ({ page, context }) => {
  const { chooseShop, planSuppers } = await import('./helpers');
  await chooseShop(page, context, /TEST Checkers Somerset West/);
  await planSuppers(page, { people: 2, budget: 900 });
  await page.getByLabel('Change something?').fill('No fish this week and quicker meals');
  await page.getByRole('button', { name: 'Update plan' }).click();
  await expect(page.getByLabel('Change something?')).toHaveValue('');
  const plan = await page.evaluate(async () => (await (await fetch('/api/plans/latest')).json()) as { plan: { request: { exclusions: string[]; maxCookMinutes: number } } });
  expect(plan.plan.request.exclusions).toContain('fish');
  expect(plan.plan.request.maxCookMinutes).toBe(30);
});
