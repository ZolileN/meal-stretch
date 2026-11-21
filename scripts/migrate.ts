/**
 * `pnpm db:migrate`: apply db/migrations in order against DATABASE_URL (Neon).
 * Uses the Neon WebSocket Pool (multi-statement scripts need the simple query protocol).
 * The local PGlite database migrates itself on start (pnpm db:local).
 */
import { Pool } from '@neondatabase/serverless';
import { migrate } from '../db/migrations';
import { env, requireDatabaseUrl } from '../lib/env';
import { loadEnvFile } from './db-runner';

loadEnvFile();
if (env().DATABASE_HTTP_ENDPOINT) {
  console.log('Local database migrates itself on `pnpm db:local`; nothing to do.');
  process.exit(0);
}
const pool = new Pool({ connectionString: requireDatabaseUrl() });
const client = await pool.connect();
try {
  const applied = await migrate(
    { exec: (s) => client.query(s), query: async (s, p) => client.query(s, p as unknown[]) as never },
    { log: (m) => console.log(m) },
  );
  console.log(applied.length ? `applied ${applied.length} migration(s)` : 'up to date');
} finally {
  client.release();
  await pool.end();
}
