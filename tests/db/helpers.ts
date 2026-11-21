/**
 * Shared disposable in-memory PGlite + PostGIS for integration tests (never a real database).
 * One instance per test run (the db project runs in a single worker with isolate: false).
 */
import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { createMigratedPglite } from '@/db/pglite';
import * as schema from '@/db/schema';
import { setDbForTests, type Db } from '@/lib/db';
import { seedAll, type SeedOptions } from '@/scripts/seed-lib';

let pg: Promise<PGlite> | undefined;

export async function testPg(): Promise<PGlite> {
  pg ??= createMigratedPglite();
  return pg;
}

export async function testDb(): Promise<{ pg: PGlite; db: Db }> {
  const p = await testPg();
  const db = drizzle({ client: p, schema }) as unknown as Db;
  setDbForTests(db);
  return { pg: p, db };
}

let seeded = false;
export async function seededTestDb(opts?: SeedOptions) {
  const t = await testDb();
  if (!seeded) {
    await seedAll(t.db, opts);
    seeded = true;
  }
  return t;
}
