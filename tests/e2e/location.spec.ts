import { expect, test } from '@playwright/test';

test.describe('location & stores (Phase 1)', () => {
  test('geolocation denied → search "Bluewater Bay" → pick Checkers → persisted on reload', async ({ page, context }) => {
    await context.clearPermissions();
    await page.goto('/start');
    await page.getByRole('button', { name: 'Use my current location' }).click();
    const search = page.getByLabel('Search suburb, section or street');
    await expect(search).toBeFocused();
    await search.fill('Bluewater Bay');
    await page.getByRole('button', { name: /^Bluewater Bay/ }).first().click();

    await expect(page.getByText('Near Bluewater Bay')).toBeVisible();
    await expect(page.getByText('© OpenStreetMap contributors')).toBeVisible();
    await page.getByRole('button', { name: /TEST Checkers Bluewater Bay/ }).click();
    await expect(page.getByRole('button', { name: /TEST Checkers Bluewater Bay/ })).toHaveAttribute('aria-pressed', 'true');

    // Loyalty chip appears only for the chosen shop's programme; wording is "I have this card", never "Enrol"
    const card = page.getByRole('button', { name: /Xtra Savings · I have this card/ });
    await expect(card).toBeVisible();
    await expect(page.getByText(/Enrol/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Smart Shopper/ })).toHaveCount(0);
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/start\/household$/);

    await page.reload();
    const bar = page.getByTestId('location-bar');
    await expect(bar).toContainText('Shopping near Bluewater Bay');
    await expect(bar).toContainText('Checkers');

    // LOC-6: tapping the bar opens the sheet at the shops step, selections intact
    await bar.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'Pick your shops' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /TEST Checkers Bluewater Bay/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: /Xtra Savings · I have this card ✓/ })).toBeVisible();
  });

  test('geolocation mocked in Somerset West → label + stores shown', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -34.0772, longitude: 18.8461 });
    await page.goto('/start');
    await page.getByRole('button', { name: 'Use my current location' }).click();
    await expect(page.getByText('Near Somerset West')).toBeVisible();
    await expect(page.getByRole('button', { name: /TEST Checkers Somerset West/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /TEST Pick n Pay Somerset West/ })).toBeVisible();
    await expect(page.getByText('Within 5 km')).toBeVisible();
  });

  test('"My shop isn\'t listed" creates a report', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -34.0772, longitude: 18.8461 });
    await page.goto('/start');
    await page.getByRole('button', { name: 'Use my current location' }).click();
    await page.getByRole('button', { name: "My shop isn't listed" }).click();
    await page.getByLabel('Which shop?').selectOption({ label: 'Boxer' });
    await page.getByLabel('Where is it? (optional)').fill('Next to the taxi rank');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText("Thanks! We'll check and add it.")).toBeVisible();
  });
});
