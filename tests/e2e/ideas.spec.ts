import { expect, test } from '@playwright/test';
import { chooseShop, planSuppers } from './helpers';

test('meal ideas: ask in the swap sheet → priced ideas from our recipes → choose one (fixture mode)', async ({ page, context }) => {
  await chooseShop(page, context, /TEST Checkers Somerset West/);
  await planSuppers(page, { people: 2, budget: 900 });

  const day2 = page.getByTestId('meal-2');
  await day2.getByRole('button', { name: 'Swap' }).click();
  const sheet = page.getByRole('dialog');
  const ideas = sheet.getByTestId('idea-search');
  await ideas.getByLabel('What do you feel like?').fill('something quick with chicken');
  await ideas.getByRole('button', { name: 'Find ideas' }).click();
  const options = ideas.getByTestId('idea-option');
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeLessThanOrEqual(5);
  await expect(options.first()).toContainText(/R[\d,.]+\/plate/);
  await expect(options.first()).toContainText(/cheaper|more|same price/);
  const chosen = ((await options.first().locator('.font-semibold').first().textContent()) ?? '').trim();
  await options.first().getByRole('button', { name: 'Choose' }).click();
  await expect(page.getByTestId('notice')).toHaveText('Supper swapped.');
  await expect(page.getByTestId('meal-2')).toContainText(chosen);

  // Home: the "Meal ideas" shortcut opens the same search for tonight, chips work.
  await page.goto('/');
  await page.getByRole('button', { name: /Meal ideas/ }).click();
  const home = page.getByRole('dialog').getByTestId('idea-search');
  await home.getByRole('button', { name: 'Meat-free' }).click();
  await expect(home.getByTestId('idea-option').first()).toBeVisible();
});
