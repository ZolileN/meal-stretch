import { expect, test, type Page } from '@playwright/test';
import { chooseShop, planSuppers } from './helpers';

async function signInByEmail(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your email for a sign-in link.')).toBeVisible();
  const res = await page.request.get(`/api/dev/mailbox?email=${encodeURIComponent(email)}`);
  expect(res.ok()).toBe(true);
  const { link } = (await res.json()) as { link: string };
  await page.goto(link);
}

test.describe('accounts, sharing, settings, admin (Phase 8)', () => {
  test('anonymous use → sign in → data merged (ACC-2)', async ({ page, context }) => {
    await chooseShop(page, context, /TEST Checkers Somerset West/);
    await planSuppers(page, { people: 2, budget: 900 });
    const before = (await (await page.request.get('/api/plans/latest')).json()) as { plan: { id: string } };
    const h0 = (await (await page.request.get('/api/household')).json()) as { household: { userId: string | null } };
    expect(h0.household.userId).toBeNull();

    const email = `merge${Date.now()}@example.com`;
    await signInByEmail(page, email);
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.getByTestId('plan-header')).toBeVisible();

    const after = (await (await page.request.get('/api/plans/latest')).json()) as { plan: { id: string } };
    expect(after.plan.id).toBe(before.plan.id);
    const h1 = (await (await page.request.get('/api/household')).json()) as { household: { userId: string | null } };
    expect(h1.household.userId).not.toBeNull();
    await page.goto('/settings');
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

    // A second phone: anonymous plan, then the same account → merged, no duplicates
    const phone2 = await context.browser()!.newContext({ ...test.info().project.use });
    const p2 = await phone2.newPage();
    await chooseShop(p2, phone2, /TEST Pick n Pay Somerset West/);
    await planSuppers(p2, { people: 2, budget: 900 });
    const plan2 = (await (await p2.request.get('/api/plans/latest')).json()) as { plan: { id: string } };
    await signInByEmail(p2, email);
    const merged = (await (await p2.request.get('/api/plans/latest')).json()) as { plan: { id: string } };
    expect(merged.plan.id).toBe(plan2.plan.id); // newest plan stays active
    const exportData = (await (await p2.request.get('/api/account/export')).json()) as { plans: { id: string; status: string }[] };
    const ids = exportData.plans.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([before.plan.id, plan2.plan.id]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(exportData.plans.filter((p) => p.status === 'active')).toHaveLength(1);
    await phone2.close();
  });

  test('share link: account prompt first (skippable), others can read + tick, revocable (ACC-3)', async ({ page, context, browser }) => {
    await chooseShop(page, context, /TEST Checkers Somerset West/);
    await planSuppers(page, { people: 2, budget: 900 });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Create a link' }).click();
    await expect(page.getByTestId('account-prompt')).toBeVisible();
    await page.getByTestId('account-prompt').getByRole('button', { name: 'Not now' }).click();
    const link = page.getByTestId('share-links').locator('code').first();
    await expect(link).toContainText('/s/');
    const url = new URL((await link.textContent())!);

    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(url.pathname);
    await expect(p2.getByText('You can tick items.', { exact: false })).toBeVisible();
    await expect(p2.getByRole('button', { name: 'Already have it' })).toHaveCount(0);
    await p2.getByRole('checkbox', { name: /^Tick / }).first().check();
    await expect(p2.getByTestId('list-footer')).toContainText(/ · 1\/\d+ ticked/);
    await expect.poll(async () => {
      await page.goto('/list');
      return (await page.getByTestId('list-footer').textContent()) ?? '';
    }).toMatch(/ · 1\/\d+ ticked/);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Turn off' }).first().click();
    await expect(page.getByTestId('share-links').locator('code')).toHaveCount(0);
    await p2.goto(url.pathname);
    await expect(p2.getByText('This link is no longer active.')).toBeVisible();
    await other.close();
  });

  test('admin is role-checked server-side (ADM-1) and shows price health', async ({ page }) => {
    await page.goto('/admin/prices');
    expect((await page.request.get('/admin/prices')).status()).toBe(404);
    await signInByEmail(page, `someone${Date.now()}@example.com`);
    expect((await page.request.get('/admin')).status()).toBe(404);
    await page.context().clearCookies();
    await signInByEmail(page, 'admin@e2e.test');
    await page.goto('/admin/prices');
    await expect(page.getByTestId('price-health')).toContainText('Checkers');
    await page.goto('/admin/pilot');
    await expect(page.getByTestId('pilot')).toContainText('Pilot dashboard');
    await page.goto('/admin/recipes/curry_mince_rice');
    await page.getByLabel('Branch').selectOption({ label: 'TEST Checkers Somerset West' });
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('cost-preview')).toContainText(/Per plate: R/);
  });

  test('settings: language switch and data delete (I18N, ACC-4)', async ({ page, context }) => {
    await chooseShop(page, context, /TEST Checkers Somerset West/);
    await planSuppers(page, { people: 1, budget: 500 });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Afrikaans' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'af');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete my data' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get('/api/plans/latest')).status()).toBe(404);
  });
});
