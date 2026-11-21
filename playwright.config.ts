import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 4545);
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E runs the real app against a fresh local PGlite DB (fictional TEST branches + fixture prices).
 * E2E_PROD=1 uses `next build && next start` (closer to production, slower to start).
 */
const dbEnv = {
  DATABASE_URL: `postgres://local:local@localhost:${DB_PORT}/mealstretch`,
  DATABASE_HTTP_ENDPOINT: `http://localhost:${DB_PORT}/sql`,
};

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    ...devices['Pixel 7'],
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm db:local',
      url: `http://localhost:${DB_PORT}/health`,
      env: { LOCAL_DB_PORT: String(DB_PORT), LOCAL_DB_DIR: '.pglite/e2e', LOCAL_DB_RESET: '1' },
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: process.env.E2E_PROD ? `pnpm build && pnpm start -p ${PORT}` : `pnpm dev:next -p ${PORT}`,
      url: baseURL,
      env: { ...dbEnv, E2E: '1', NEXT_TELEMETRY_DISABLED: '1' },
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
  ],
});
