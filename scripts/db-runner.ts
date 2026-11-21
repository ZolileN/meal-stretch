/** SqlRunner for scripts: Neon HTTP (or the local PGlite shim via DATABASE_HTTP_ENDPOINT). */
import net from 'node:net';
import { neon, neonConfig } from '@neondatabase/serverless';
import { requireDatabaseUrl, env } from '../lib/env';

// Node tries each address of a host for only 250 ms by default ("happy eyeballs"). On slow or IPv4-only home
// connections that makes calls to Neon (eu-west-2) fail at random with ETIMEDOUT. Scripts get 5 s per attempt.
net.setDefaultAutoSelectFamilyAttemptTimeout(5000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const transient = (e: unknown) => /fetch failed|ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|socket hang up|Error connecting to database/i.test(String((e as Error)?.message ?? e) + String((e as { sourceError?: unknown })?.sourceError ?? ''));

export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export function scriptRunner(): SqlRunner {
  const endpoint = env().DATABASE_HTTP_ENDPOINT;
  if (endpoint) neonConfig.fetchEndpoint = () => endpoint;
  const sql = neon(requireDatabaseUrl());
  return {
    // Retries network blips only (never SQL errors); every statement scripts send is idempotent.
    query: async <T,>(text: string, params: unknown[] = []) => {
      for (let attempt = 1; ; attempt++) {
        try {
          return { rows: (await sql.query(text, params)) as T[] };
        } catch (e) {
          if (attempt >= 4 || !transient(e)) throw e;
          await sleep(1000 * 2 ** attempt);
        }
      }
    },
  };
}

export function loadEnvFile(path = '.env.local') {
  try {
    process.loadEnvFile(path);
  } catch {
    /* optional */
  }
}
