/**
 * `pnpm db:seed`: idempotent seed (retailers, places, recipes, ingredients; plus fictional TEST
 * branches and fixture prices unless --production).
 */
import { loadEnvFile, scriptRunner } from './db-runner';
import { seedAll } from './seed-lib';

loadEnvFile();
const production = process.argv.includes('--production');
await seedAll(scriptRunner(), { testBranches: !production, fixturePrices: !production, log: (m) => console.log(m) });
