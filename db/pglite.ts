/**
 * PGlite + PostGIS + pg_trgm factory for local dev and integration tests (Node only).
 * Never imported by app code.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { postgis } from '@electric-sql/pglite-postgis';
import { migrate } from './migrations';

export async function createPglite(dataDir?: string): Promise<PGlite> {
  const db = await PGlite.create({ dataDir, extensions: { postgis, pg_trgm } });
  return db;
}

export async function createMigratedPglite(dataDir?: string, log?: (m: string) => void): Promise<PGlite> {
  const db = await createPglite(dataDir);
  await migrate(
    {
      exec: (sql) => db.exec(sql),
      query: async (sql, params) => db.query(sql, params) as never,
    },
    { log },
  );
  return db;
}
