import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { listMigrations, migrate } from '@/db/migrations';
import { testPg } from './helpers';

describe('migrations', () => {
  it('0001 is db/001_stores_location.sql unchanged', () => {
    const [first] = listMigrations();
    expect(first?.name).toBe('0001_stores_location');
    expect(first?.sql).toBe(readFileSync('db/001_stores_location.sql', 'utf8'));
  });

  it('applies all migrations on PostGIS and is re-runnable', async () => {
    const pg = await testPg();
    const applied = await pg.query<{ name: string }>('select name from schema_migrations order by name');
    expect(applied.rows.map((r) => r.name)).toEqual(listMigrations().map((m) => m.name));
    const again = await migrate({ exec: (s) => pg.exec(s), query: (s, p) => pg.query(s, p) as never });
    expect(again).toEqual([]);
    const v = await pg.query<{ v: string }>('select postgis_version() as v');
    expect(v.rows[0]?.v).toMatch(/^3\./);
  });
});
