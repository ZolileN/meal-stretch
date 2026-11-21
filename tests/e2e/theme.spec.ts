/**
 * docs/THEME.md §5 and §7.6: screenshots at 360 × 780, nothing hidden under the floating nav,
 * and text at 200% without overlap. Screens with dates/prices use the fixed /dev/screens fixtures.
 */
import { expect, test, type Page } from '@playwright/test';
import { SOMERSET_WEST } from './helpers';

test.use({ viewport: { width: 360, height: 780 } });

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
};
const shot = { maxDiffPixelRatio: 0.01, animations: 'disabled' as const };

test.describe('screenshots (360 × 780)', () => {
  for (const [name, url] of [
    ['home', '/dev/screens/home'],
    ['plan', '/dev/screens/plan'],
    ['list', '/dev/screens/list'],
    ['savings', '/dev/screens/savings'],
    ['onboarding-o3', '/start/household'],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(url);
      await settle(page);
      await expect(page).toHaveScreenshot(`${name}.png`, shot);
    });
  }

  test('meal card', async ({ page }) => {
    await page.goto('/dev/screens/plan');
    await settle(page);
    await expect(page.getByTestId('meal-2')).toHaveScreenshot('meal-card.png', shot);
  });

  test('location sheet', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(SOMERSET_WEST);
    await page.goto('/start');
    await page.getByRole('button', { name: 'Use my current location' }).click();
    await expect(page.getByRole('heading', { name: 'Pick your shops' })).toBeVisible();
    await page.getByTestId('location-bar').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('button', { name: /TEST Checkers Somerset West/ })).toBeVisible();
    await settle(page);
    await expect(sheet).toHaveScreenshot('location-sheet.png', shot);
  });
});

/** Visible content elements (outside floating layers) that intersect the bottom nav or a floating footer. */
async function coveredByFloating(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('[data-bottom-nav] ul')?.getBoundingClientRect() ?? null;
    const floats = [...document.querySelectorAll('[data-floating] > *')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
    const layers = [...(nav ? [nav] : []), ...floats];
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const out: string[] = [];
    for (const el of document.querySelectorAll('main a, main button, main input, main p, main h1, main h2, main h3, main li > *')) {
      if (el.closest('[data-floating]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight) continue;
      if (layers.some((l) => hit(r, l))) out.push(`${el.tagName.toLowerCase()}: ${(el.textContent ?? '').trim().slice(0, 40)}`);
    }
    return { hasNav: Boolean(nav), out };
  });
}

test.describe('floating elements never cover content (§5)', () => {
  for (const url of ['/', '/dev/screens/home', '/dev/screens/plan', '/dev/screens/over', '/dev/screens/list', '/dev/screens/savings', '/settings', '/dev/ui']) {
    test(`scrolled to the end of ${url}`, async ({ page }) => {
      await page.goto(url);
      await settle(page);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      const { hasNav, out } = await coveredByFloating(page);
      expect(hasNav).toBe(true);
      expect(out).toEqual([]);
    });
  }

  test('list footer sits above the nav', async ({ page }) => {
    await page.goto('/dev/screens/list');
    await settle(page);
    const footer = await page.getByTestId('list-footer').boundingBox();
    const nav = await page.locator('[data-bottom-nav] ul').boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(nav!.y);
  });

  test('no floating chat button, nav hidden during onboarding', async ({ page }) => {
    await page.goto('/start/household');
    await expect(page.locator('[data-bottom-nav]')).toHaveCount(0);
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Main menu' }).getByRole('link')).toHaveText(['Home', 'Plan', 'Tonight', 'List', 'Savings']);
    await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: /chat/i })).toHaveCount(0);
  });
});

test.describe('text at 200% (§5)', () => {
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  test('plan card and list: no horizontal scroll, no overlapping parts', async ({ page }) => {
    for (const url of ['/dev/screens/plan', '/dev/screens/list']) {
      await page.goto(url);
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), url).toBeLessThanOrEqual(0);
      if (url.endsWith('plan')) {
        const header = page.getByTestId('plan-header');
        const ring = await header.getByRole('img').boundingBox();
        for (const part of [header.locator('[data-part="total"]'), header.getByRole('heading', { level: 1 })]) expect(overlap(ring!, (await part.boundingBox())!)).toBe(false);
        expect(await header.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
      } else {
        for (const line of await page.getByTestId('list-line').all()) {
          const name = await line.locator('[data-part="name"]').boundingBox();
          const price = await line.locator('[data-part="price"]').boundingBox();
          expect(overlap(name!, price!)).toBe(false);
        }
      }
    }
  });
});
