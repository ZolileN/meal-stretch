/**
 * Local database: PGlite + PostGIS behind a Neon-compatible HTTP endpoint, so the app uses the
 * same @neondatabase/serverless HTTP driver locally and on Vercel (docs/decisions.md 2026-11-21).
 *
 *   pnpm db:local                     # persistent, data in .pglite/dev
 *   LOCAL_DB_DIR=.pglite/e2e LOCAL_DB_RESET=1 pnpm db:local   # fresh (used by Playwright)
 *
 * Protocol (subset used by the driver): POST /sql with {query, params} or {queries:[...]};
 * responds {fields:[{name,dataTypeID}], rows:[[text...]], command, rowCount} or {results:[...]}.
 */
import { createServer } from 'node:http';
import { rmSync, mkdirSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';
import { createMigratedPglite } from '../db/pglite';
import { seedAll } from './seed-lib';

const port = Number(process.env.LOCAL_DB_PORT ?? 4444);
const dir = process.env.LOCAL_DB_DIR ?? '.pglite/dev';

type Q = { query: string; params?: unknown[] };

// Return raw text values: the Neon driver parses them with pg-types, exactly as with real Neon.
const RAW = new Proxy({}, { get: () => (x: string) => x });

async function run(db: PGlite, q: Q) {
  const res = await db.query<unknown[]>(q.query, (q.params ?? []) as unknown[], { rowMode: 'array' });
  const command = (q.query.trim().split(/\s+/)[0] ?? '').toUpperCase();
  return {
    command,
    rowCount: res.affectedRows ?? res.rows.length,
    fields: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: res.rows,
    rowAsArray: true,
  };
}

async function main() {
  if (process.env.LOCAL_DB_RESET) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const t0 = performance.now();
  const db = await createMigratedPglite(dir, (m) => console.log(`[local-db] ${m}`));
  (db as unknown as { parsers: unknown }).parsers = RAW;
  if (!process.env.LOCAL_DB_NO_SEED) {
    await seedAll(db, { log: (m) => console.log(`[local-db] ${m}`) });
  }

  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200).end('ok');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    let body: Q | { queries: Q[] };
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'invalid JSON' }));
      return;
    }
    try {
      let out: unknown;
      if ('queries' in body) {
        out = {
          results: await db.transaction(async (tx) => {
            const results = [];
            for (const q of body.queries) results.push(await run(tx as unknown as PGlite, q));
            return results;
          }),
        };
      } else {
        out = await run(db, body);
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    } catch (e) {
      const err = e as Record<string, unknown>;
      res.writeHead(400, { 'content-type': 'application/json' }).end(
        JSON.stringify({ message: String(err.message ?? e), code: err.code, detail: err.detail, constraint: err.constraint }),
      );
    }
  });
  server.listen(port, () =>
    console.log(`[local-db] ready on http://localhost:${port}/sql (${dir}) in ${Math.round(performance.now() - t0)} ms`),
  );
  const stop = async () => {
    server.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void main();
