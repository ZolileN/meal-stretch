/**
 * `pnpm import:prices <file.csv> [--source manual|catalogue|leaflet|guide] [--dry-run]`
 * Validates every row with Zod, reports rejected rows with reasons, creates missing products + aliases,
 * appends price observations and refreshes current_prices.
 */
import { readFileSync } from 'node:fs';
import { loadEnvFile } from './db-runner';
import { validateCsv } from '../lib/prices/csv';

loadEnvFile();
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--source');
if (!file) {
  console.error('usage: pnpm import:prices <file.csv> [--source manual|catalogue|leaflet|guide] [--dry-run]');
  process.exit(2);
}
const srcIdx = args.indexOf('--source');
const source = (srcIdx >= 0 ? args[srcIdx + 1] : 'manual') as 'manual' | 'catalogue' | 'leaflet' | 'guide';
if (!['manual', 'catalogue', 'leaflet', 'guide'].includes(source)) {
  console.error('--source must be manual, catalogue or leaflet (receipts come from the receipt pipeline)');
  process.exit(2);
}
const { rows, rejected } = validateCsv(readFileSync(file, 'utf8'));
for (const r of rejected) console.log(`line ${r.line}: REJECTED ${r.reasons.join('; ')}`);
if (args.includes('--dry-run')) {
  console.log(`${rows.length} valid, ${rejected.length} rejected (dry run, nothing written)`);
  process.exit(rejected.length ? 1 : 0);
}
const { getDb } = await import('../lib/db');
const { importPriceRows } = await import('../lib/prices/import');
const res = await importPriceRows(getDb(), rows, { source, kind: 'csv' });
for (const r of res.rejected) console.log(`line ${r.line}: REJECTED ${r.reasons.join('; ')}`);
console.log(
  `batch ${res.batchId}: ${res.accepted} accepted, ${rejected.length + res.rejected.length} rejected, ` +
    `${res.productsCreated} products created, ${res.observationsCreated} observations`,
);
