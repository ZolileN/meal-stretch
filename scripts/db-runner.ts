/** SqlRunner for scripts: Neon HTTP (or the local PGlite shim via DATABASE_HTTP_ENDPOINT). */
import { neon, neonConfig } from '@neondatabase/serverless';
import { requireDatabaseUrl, env } from '../lib/env';

export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

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
