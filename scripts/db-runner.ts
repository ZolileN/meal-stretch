/** SqlRunner for scripts: Neon HTTP (or the local PGlite shim via DATABASE_HTTP_ENDPOINT). */
import { neon, neonConfig } from '@neondatabase/serverless';
import { requireDatabaseUrl, env } from '../lib/env';
import type { SqlRunner } from './seed-lib';

export function scriptRunner(): SqlRunner {
  const endpoint = env().DATABASE_HTTP_ENDPOINT;
  if (endpoint) neonConfig.fetchEndpoint = () => endpoint;
  const sql = neon(requireDatabaseUrl());
  return {
    query: async <T,>(text: string, params: unknown[] = []) => ({ rows: (await sql.query(text, params)) as T[] }),
  };
}

export function loadEnvFile(path = '.env.local') {
  try {
    process.loadEnvFile(path);
  } catch {
    /* optional */
  }
}
