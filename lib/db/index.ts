/**
 * Database access. Production: Neon over HTTP (works on Edge). Local dev: the same driver pointed at
 * scripts/local-db.ts via DATABASE_HTTP_ENDPOINT. Tests inject an in-memory PGlite with setDbForTests().
 * Parameterised SQL only: Drizzle builder or the sql`` template (CLAUDE.md).
 */
import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { env, requireDatabaseUrl } from '@/lib/env';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

let instance: Db | undefined;

export function getDb(): Db {
  if (instance) return instance;
  const url = requireDatabaseUrl();
  const endpoint = env().DATABASE_HTTP_ENDPOINT;
  if (endpoint) neonConfig.fetchEndpoint = () => endpoint;
  instance = drizzle({ client: neon(url), schema }) as unknown as Db;
  return instance;
}

/** Tests only: swap in another Drizzle database (e.g. PGlite). */
export function setDbForTests(db: Db | undefined) {
  instance = db;
}

/** Run raw parameterised SQL and return typed rows (works for neon-http and pglite results). */
export async function query<T>(db: Db, statement: SQL): Promise<T[]> {
  const res = (await db.execute(statement)) as unknown as { rows: T[] };
  return res.rows;
}

export { schema };
