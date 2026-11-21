import { describe, expect, it } from 'vitest';
import { getTableConfig, getMaterializedViewConfig, PgMaterializedView, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';
import { testPg } from './helpers';

describe('Drizzle schema mirrors the SQL migrations', () => {
  it('every table/view and column exists with the same names', async () => {
    const pg = await testPg();
    const cols = await pg.query<{ table_name: string; column_name: string }>(
      `select c.relname as table_name, a.attname as column_name
       from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'm') and a.attnum > 0 and not a.attisdropped`,
    );
    const db = new Map<string, Set<string>>();
    for (const r of cols.rows) {
      if (!db.has(r.table_name)) db.set(r.table_name, new Set());
      db.get(r.table_name)!.add(r.column_name);
    }
    let checked = 0;
    for (const v of Object.values(schema)) {
      let name: string | undefined;
      let columns: string[] = [];
      if (v instanceof PgTable) {
        const c = getTableConfig(v);
        name = c.name;
        columns = c.columns.map((x) => x.name);
      } else if (v instanceof PgMaterializedView) {
        const c = getMaterializedViewConfig(v);
        name = c.name;
        columns = Object.values(c.selectedFields as Record<string, { name: string }>).map((x) => x.name);
      } else continue;
      checked++;
      expect(db.has(name), `table ${name} missing in SQL`).toBe(true);
      expect([...db.get(name)!].sort(), `columns of ${name}`).toEqual([...columns].sort());
    }
    expect(checked).toBeGreaterThan(25);
  });
});
