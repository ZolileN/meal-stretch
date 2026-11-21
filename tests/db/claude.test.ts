import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { claudeTool, ClaudeError, contentHash, usedToday } from '@/lib/claude';
import { createHousehold, householdById, updateHousehold } from '@/lib/household';
import { createPlan } from '@/lib/plans/service';
import { applyExtraction, createReceipt, processReceipt, receiptView } from '@/lib/receipts/pipeline';
import { createReviewBatch, publishBatch, resolveUnmatched, reviewBatch, unmatchedQueue } from '@/lib/leaflets';
import { matchProduct } from '@/lib/prices/match';
import { parseTweak } from '@/lib/plans/tweak';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let checkers: number;
const dir = mkdtempSync(join(tmpdir(), 'claude-fixtures-'));
const saved = { key: process.env.ANTHROPIC_API_KEY, dir: process.env.CLAUDE_FIXTURE_DIR };

beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  process.env.ANTHROPIC_API_KEY = '';
  process.env.CLAUDE_FIXTURE_DIR = dir;
  resetEnvCache();
  checkers = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Checkers Somerset West'`)).rows[0]!.id);
});
afterAll(() => {
  process.env.ANTHROPIC_API_KEY = saved.key;
  process.env.CLAUDE_FIXTURE_DIR = saved.dir;
  resetEnvCache();
  rmSync(dir, { recursive: true, force: true });
});

const tool = { name: 't', description: 'd', input_schema: { type: 'object' } };
const schema = z.object({ n: z.number().int() });

describe('lib/claude (fixture mode, cache, caps, Zod)', () => {
  it('no key and no fixture → unavailable', async () => {
    await expect(claudeTool({ db, purpose: 'leaflet', householdId: null, model: 'm', system: 's', tool, schema, content: [{ type: 'text', text: 'none' }] })).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('fixture output is Zod-validated; invalid output rejected', async () => {
    await expect(
      claudeTool({ db, purpose: 'leaflet', householdId: null, model: 'm', system: 's', tool, schema, content: [{ type: 'text', text: 'bad' }], fixtureFallback: () => ({ n: 1.5 }) }),
    ).rejects.toMatchObject({ code: 'invalid_output' });
    const r = await claudeTool({ db, purpose: 'leaflet', householdId: null, model: 'm', system: 's', tool, schema, content: [{ type: 'text', text: 'ok' }], fixtureFallback: () => ({ n: 2 }) });
    expect(r).toMatchObject({ output: { n: 2 }, fixture: true, cached: false });
  });
  it('content-hash cache: identical request served from llm_calls without a new call', async () => {
    const args = { db, purpose: 'leaflet' as const, householdId: null, model: 'm', system: 's', tool, schema, content: [{ type: 'text' as const, text: 'ok' }] };
    const again = await claudeTool({ ...args, fixtureFallback: () => ({ n: 999 }) });
    expect(again).toMatchObject({ output: { n: 2 }, cached: true });
    expect(contentHash({ a: 1 })).toHaveLength(64);
  });
  it('recorded fixtures are read from CLAUDE_FIXTURE_DIR/<purpose>/<hash>.json', async () => {
    const args = { db, purpose: 'leaflet' as const, householdId: null, model: 'm', system: 's', tool, schema, content: [{ type: 'text' as const, text: 'recorded' }] };
    await expect(claudeTool(args)).rejects.toMatchObject({ code: 'unavailable' });
    const hash = readdirSync(dir).length >= 0 ? contentHash({ v: 1, model: 'm', purpose: 'leaflet', system: 's', tool, content: args.content }) : '';
    mkdirSync(join(dir, 'leaflet'), { recursive: true });
    writeFileSync(join(dir, 'leaflet', `${hash}.json`), JSON.stringify({ n: 7 }));
    expect((await claudeTool(args)).output).toEqual({ n: 7 });
  });
  it('per-household daily caps: 10 tweaks', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    for (let i = 0; i < 10; i++) await parseTweak(db, h.id, `no fish ${i} quick`);
    expect(await usedToday(db, h.id, 'tweak')).toBe(10);
    await expect(parseTweak(db, h.id, 'no beef please')).rejects.toBeInstanceOf(ClaudeError);
    await expect(parseTweak(db, h.id, 'no beef please')).rejects.toMatchObject({ code: 'cap_reached' });
    // a cached repeat doesn't count and isn't blocked
    expect((await parseTweak(db, h.id, 'no fish 3 quick')).cached).toBe(true);
  });
});

describe('receipts (RCP-1…6)', () => {
  it('consent required first time; size/type checked; cap of 5 per day', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const img = { bytes: new Uint8Array([1, 2, 3]), type: 'image/jpeg' };
    await expect(createReceipt(db, h, img, { consent: false })).rejects.toMatchObject({ code: 'consent_required' });
    await expect(createReceipt(db, h, { bytes: new Uint8Array(3 * 1024 * 1024), type: 'image/jpeg' }, { consent: true })).rejects.toMatchObject({ code: 'too_large' });
    const h2 = (await householdById(db, h.id))!;
    expect(h2.receiptConsentAt).not.toBeNull();
    await expect(createReceipt(db, h2, { bytes: img.bytes, type: 'application/pdf' }, { consent: true })).rejects.toMatchObject({ code: 'bad_type' });
    const id = await createReceipt(db, h2, img, { consent: false });
    const row = await pg.query<{ status: string; days: number }>(`select status, extract(day from image_delete_after - created_at)::int days from receipts where id = $1`, [id]);
    expect(row.rows[0]).toMatchObject({ status: 'processing', days: 30 });
    for (let i = 0; i < 5; i++) await pg.query(`insert into llm_calls (household_id, purpose, content_hash, model) values ($1, 'receipt', $2, 'm')`, [h.id, `x${i}`]);
    await expect(createReceipt(db, h2, img, { consent: false })).rejects.toMatchObject({ code: 'cap_reached' });
  });

  it('verified slip: PII stripped, matched lines → savings + branch-level receipt observations; unmatched queued', async () => {
    let h = await createHousehold(db, crypto.randomUUID());
    h = await updateHousehold(db, h.id, { mainBranchId: checkers });
    const plan = await createPlan(db, h, { household: { light: 0, average: 2, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, days: 7 });
    const today = new Date().toISOString().slice(0, 10);
    const rec = await pg.query<{ id: string }>(`insert into receipts (household_id, status) values ($1, 'processing') returning id`, [h.id]);
    const id = rec.rows[0]!.id;
    const r = await applyExtraction(db, h, id, {
      document_type: 'receipt', retailer: 'CHECKERS SOMERSET WEST', branch_text: 'Tel 021 555 1234', date: today, total_cents: 2999 + 3999 + 1500,
      lines: [
        { raw_name: 'FIXTURE Beef Mince', size_text: '500g', price_cents: 2999, was_price_cents: 5499, confidence: 0.95 },
        { raw_name: 'Long Grain Rice 2 kg', size_text: '2kg', price_cents: 3999, member_only: true, confidence: 0.9 },
        { raw_name: 'MYSTERY ITEM', price_cents: 1500 },
        { raw_name: 'Cashier: Thandi Mokoena', price_cents: 0 },
      ],
    });
    expect(r.status).toBe('verified');
    const v = (await receiptView(db, h.id, id))!;
    expect(v.lines.map((l) => l.matched)).toEqual([true, true, false]);
    expect(v.verified!.savedCents).toBe(Math.max(0, v.verified!.normalCents - v.verified!.paidCents));
    expect(v.verified!.savedCents).toBeGreaterThanOrEqual(5499 - 2999);
    const stored = await pg.query<{ extraction: { branch_text: string } }>(`select extraction from receipts where id = $1`, [id]);
    expect(JSON.stringify(stored.rows[0]!.extraction)).not.toMatch(/021 555 1234|Thandi/);
    const obs = await pg.query<{ source: string; branch_id: number; price_cents: number; special_price_cents: number | null; household_id: string }>(
      `select source, branch_id, price_cents, special_price_cents, household_id from price_observations where source = 'receipt' and household_id = $1 order by id`, [h.id],
    );
    expect(obs.rows[0]).toMatchObject({ source: 'receipt', branch_id: checkers, price_cents: 5499, special_price_cents: 2999 });
    expect((await unmatchedQueue(db)).some((u) => u.raw_name === 'MYSTERY ITEM')).toBe(true);
    const ev = await pg.query<{ plan_id: string }>(`select plan_id from savings_events where kind = 'receipt_verified' and ref_id = $1`, [id]);
    expect(ev.rows[0]!.plan_id).toBe(plan.id);
  });

  it('totals off by more than 2% → needs_review, no savings', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const rec = await pg.query<{ id: string }>(`insert into receipts (household_id, status) values ($1, 'processing') returning id`, [h.id]);
    const r = await applyExtraction(db, h, rec.rows[0]!.id, { document_type: 'receipt', retailer: 'Checkers', total_cents: 10_000, lines: [{ raw_name: 'Beef Mince', price_cents: 5000 }] });
    expect(r.status).toBe('needs_review');
    expect((await pg.query(`select 1 from savings_events where ref_id = $1`, [rec.rows[0]!.id])).rows).toHaveLength(0);
  });

  it('processReceipt without a key or fixture marks the slip failed', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const rec = await pg.query<{ id: string }>(`insert into receipts (household_id, status) values ($1, 'processing') returning id`, [h.id]);
    expect((await processReceipt(db, h, rec.rows[0]!.id, { householdId: h.id, imageBase64: 'AAAA', mediaType: 'image/jpeg' })).status).toBe('failed');
  });
});

describe('matching (RCP-3, §10.3)', () => {
  it('alias exact, fuzzy with size, else null', async () => {
    expect((await matchProduct(db, 'checkers', 'Beef Mince', '500g'))?.method).toBe('alias');
    const fuzzy = await matchProduct(db, 'checkers', 'Beef Minse', '500g');
    expect(fuzzy?.method).toBe('fuzzy');
    expect(fuzzy!.confidence).toBeGreaterThanOrEqual(0.55);
    expect(await matchProduct(db, 'checkers', 'Beef Minse', '750g')).toBeNull(); // size must match for fuzzy
    expect(await matchProduct(db, 'checkers', 'Totally Unknown Thing', null)).toBeNull();
  });
});

describe('admin leaflet flow (ADM-2, ADM-3)', () => {
  it('extraction → review → publish as leaflet observations; unmapped → unmatched → alias', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const batchId = await createReviewBatch(db, 'shoprite', null, {
      document_type: 'leaflet', retailer: 'Shoprite', date: today, valid_until: today,
      lines: [
        { raw_name: 'Beef Mince Value Pack', size_text: '1kg', price_cents: 7999, was_price_cents: 9499 },
        { raw_name: 'Imaginary Juice', size_text: '1L', price_cents: 1999 },
        { raw_name: 'Bad', price_cents: -5 },
      ],
    });
    const b = (await reviewBatch(db, batchId))!;
    expect(b.status).toBe('review');
    expect(b.lines).toHaveLength(2);
    expect(b.lines[0]!.suggestion).not.toBeNull();
    expect(b.rejected).toHaveLength(1);
    const res = await publishBatch(db, batchId, [
      { index: 0, action: 'approve' },
      { index: 1, action: 'approve' },
    ]);
    expect(res).toEqual({ published: 1, queued: 1 });
    const o = await pg.query<{ price_cents: number; special_price_cents: number; source: string; branch_id: number | null }>(
      `select price_cents, special_price_cents, source, branch_id from price_observations where ingest_batch_id = $1`, [batchId],
    );
    expect(o.rows[0]).toMatchObject({ price_cents: 9499, special_price_cents: 7999, source: 'leaflet', branch_id: null });
    await expect(publishBatch(db, batchId, [])).rejects.toThrow(/not awaiting review/);

    const item = (await unmatchedQueue(db)).find((u) => u.raw_name === 'Imaginary Juice')!;
    const pid = Number((await pg.query<{ id: number }>(`select id from products where retailer_id = 'shoprite' and ingredient_id = 'milk' limit 1`)).rows[0]!.id);
    await resolveUnmatched(db, Number(item.id), { productId: pid });
    expect((await matchProduct(db, 'shoprite', 'Imaginary Juice', null))?.productId).toBe(pid);
    expect(existsSync(dir)).toBe(true);
  });
});
