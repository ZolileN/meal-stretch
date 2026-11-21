/**
 * `pnpm db:seed`: idempotent seed (retailers, places, ingredients, recipes; plus fictional TEST
 * branches, dev-published recipes and fixture prices unless --production).
 */
import { loadEnvFile } from './db-runner';

loadEnvFile();
const { getDb } = await import('../lib/db');
const { seedAll } = await import('./seed-lib');
const production = process.argv.includes('--production');
await seedAll(getDb(), { testBranches: !production, fixturePrices: !production, log: (m) => console.log(m) });
