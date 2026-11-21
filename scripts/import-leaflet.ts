/**
 * `pnpm import:leaflet <leaflet.pdf | page.jpg ...> --retailer <id> [--province GP] [--pages-per-batch 8] [--by admin@email]`
 * --province: where the prices apply (EC, WC, GP, KZN, FS, MP, LP, NW, NC); leave out for a national leaflet.
 *
 * For leaflets too big for the browser upload (Vercel accepts ~4 MB per request). Runs on your laptop:
 * Claude reads the leaflet (PDFs in chunks of pages), and every chunk becomes a normal review batch in
 * /admin/leaflets. Nothing is published until an admin approves it there.
 *
 * Use leaflets the retailer publishes for customers, downloaded by you. This script does not fetch anything
 * from retailer websites (CLAUDE.md: no scraping; ENABLE_WEB_IMPORTERS stays false).
 * Needs ANTHROPIC_API_KEY. Each chunk is one Claude call (a few US cents).
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { pdfChunks } from './leaflet-pdf';
import { loadEnvFile } from './db-runner';

loadEnvFile();
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const retailerId = flag('--retailer');
const perBatch = Math.max(1, Math.min(20, Number(flag('--pages-per-batch') ?? 8) || 8));
const by = flag('--by');
const { parseScope } = await import('../lib/location/provinces');
const province = parseScope(flag('--province'));
const files = args.filter((a, i) => !a.startsWith('--') && !['--retailer', '--pages-per-batch', '--by', '--province'].includes(args[i - 1] ?? ''));
if (province === undefined) {
  console.error('--province must be one of EC, WC, GP, KZN, FS, MP, LP, NW, NC (or leave it out for national).');
  process.exit(2);
}
if (!retailerId || files.length === 0) {
  console.error('usage: pnpm import:leaflet <leaflet.pdf | page.jpg ...> --retailer <checkers|shoprite|pnp|spar|woolworths|boxer|usave> [--province GP] [--pages-per-batch 8] [--by admin@email]');
  process.exit(2);
}

const { getDb, query } = await import('../lib/db');
const { sql } = await import('drizzle-orm');
const { features } = await import('../lib/env');
const { extractLeaflet } = await import('../lib/leaflets');
if (!features.claude()) {
  console.error('ANTHROPIC_API_KEY is not set (add it to .env.local or the environment).');
  process.exit(2);
}
const db = getDb();
const [retailer] = await query<{ id: string; name: string }>(db, sql`select id, name from retailers where id = ${retailerId}`);
if (!retailer) {
  console.error(`Unknown retailer "${retailerId}".`);
  process.exit(2);
}
const [admin] = by ? await query<{ id: string }>(db, sql`select id from users where lower(email) = ${by.toLowerCase()}`) : [];

const IMAGE_TYPES: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const batches: number[] = [];
let failed = 0;
for (const file of files) {
  const ext = extname(file).toLowerCase();
  const bytes = readFileSync(file);
  const parts =
    ext === '.pdf'
      ? (await pdfChunks(bytes, perBatch)).map((c) => ({ ...c, type: 'application/pdf' }))
      : IMAGE_TYPES[ext]
        ? [{ label: 'image', base64: bytes.toString('base64'), type: IMAGE_TYPES[ext]! }]
        : null;
  if (!parts) {
    console.error(`${file}: unsupported file type (use .pdf, .jpg, .png or .webp)`);
    failed++;
    continue;
  }
  for (const p of parts) {
    try {
      const id = await extractLeaflet(db, { retailerId: retailer.id, uploadedBy: admin?.id ?? null, province, file: { base64: p.base64, type: p.type } });
      batches.push(id);
      console.log(`${file} (${p.label}): review batch ${id}`);
    } catch (e) {
      failed++;
      console.error(`${file} (${p.label}): FAILED – ${(e as Error).message}`);
    }
  }
}
console.log(`\n${batches.length} batch(es) ready to review at /admin/leaflets (${retailer.name}, ${province ?? 'national'}).${failed ? ` ${failed} failed: run again for those files.` : ''}`);
process.exit(failed ? 1 : 0);
