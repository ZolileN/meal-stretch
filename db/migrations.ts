/**
 * Migration list + runner (Node only). 0001 is db/001_stores_location.sql, applied unchanged;
 * later migrations are db/migrations/NNNN_name.sql in lexical order.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Migration {
  name: string;
  sql: string;
}

export interface MigrationRunner {
  /** Execute a multi-statement SQL script (simple query protocol). */
  exec(sql: string): Promise<unknown>;
  /** Parameterised single query. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const root = process.cwd();

export function listMigrations(): Migration[] {
  const first: Migration = {
    name: '0001_stores_location',
    sql: readFileSync(join(root, 'db', '001_stores_location.sql'), 'utf8'),
  };
  const dir = join(root, 'db', 'migrations');
  const rest = readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ name: f.replace(/\.sql$/, ''), sql: readFileSync(join(dir, f), 'utf8') }));
  if (rest.some((m) => m.name.startsWith('0001'))) throw new Error('0001 is reserved for db/001_stores_location.sql');
  return [first, ...rest];
}

export async function migrate(runner: MigrationRunner, opts: { log?: (msg: string) => void } = {}): Promise<string[]> {
  await runner.exec(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const done = new Set((await runner.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const applied: string[] = [];
  for (const m of listMigrations()) {
    if (done.has(m.name)) continue;
    await runner.exec(`begin;\n${m.sql}\n;insert into schema_migrations(name) values ('${m.name.replace(/'/g, "''")}');\ncommit;`);
    applied.push(m.name);
    opts.log?.(`applied ${m.name}`);
  }
  return applied;
}
