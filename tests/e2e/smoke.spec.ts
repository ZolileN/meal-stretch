import { expect, test } from '@playwright/test';

test('home page renders brand and a translated string', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Suppers that fit your budget');
});
