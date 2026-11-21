/**
 * Extraction harness (BUILD 7.5, PRD Phase 7 DoD ≥ 90% line accuracy). OPT-IN: calls the real Claude API.
 *   pnpm harness:receipts            # score every fixtures/receipts/<name>.(jpg|png|webp) against <name>.expected.json
 *   pnpm harness:receipts --record   # also save responses as fixtures (so tests can replay them without a key)
 * Expected file: { "total_cents": 39800, "lines": [{ "raw_name": "...", "price_cents": 2999 }, ...] }
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { loadEnvFile } from './db-runner';

loadEnvFile();
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY to run the harness (it calls the real API).');
  process.exit(2);
}
const dir = 'fixtures/receipts';
const images = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (!images.length) {
  console.log('No receipt photos in fixtures/receipts yet (see docs/human-todo.md).');
  process.exit(0);
}
const Anthropic = (await import('@anthropic-ai/sdk')).default;
const { EXTRACTION_TOOL, extractionSchema, validateLines } = await import('../lib/extraction');
const { lineAccuracy } = await import('../lib/receipts/score');
const { contentHash } = await import('../lib/claude');
const client = new Anthropic();
const model = process.env.CLAUDE_MODEL_VISION || 'claude-sonnet-5-5';
const record = process.argv.includes('--record');
const results: number[] = [];
for (const img of images) {
  const expectedPath = join(dir, `${basename(img, extname(img))}.expected.json`);
  if (!existsSync(expectedPath)) {
    console.log(`${img}: no .expected.json, skipped`);
    continue;
  }
  const mediaType = img.toLowerCase().endsWith('.png') ? 'image/png' : img.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  const data = readFileSync(join(dir, img)).toString('base64');
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system: 'You read South African grocery till slips. Call record_document exactly once with what is printed. Money in integer cents.',
    tools: [EXTRACTION_TOOL as never],
    tool_choice: { type: 'auto' },
    ...(model === 'claude-sonnet-5-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data } }, { type: 'text', text: 'Read this till slip.' }] }],
  });
  if (res.stop_reason === 'refusal') {
    console.log(`${img}: refused`);
    results.push(0);
    continue;
  }
  const block = res.content.find((b) => b.type === 'tool_use');
  const parsed = block && block.type === 'tool_use' ? extractionSchema.safeParse(block.input) : null;
  if (!parsed?.success) {
    console.log(`${img}: invalid output`);
    results.push(0);
    continue;
  }
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as { lines: { raw_name: string; price_cents: number }[] };
  const acc = lineAccuracy(expected.lines, validateLines(parsed.data.lines).lines);
  results.push(acc);
  console.log(`${img}: ${(acc * 100).toFixed(0)}% line accuracy (${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens)`);
  if (record) {
    const hash = contentHash({ v: 1, model, purpose: 'receipt', system: 'harness', tool: EXTRACTION_TOOL, content: data.length });
    mkdirSync('fixtures/claude/receipt-harness', { recursive: true });
    writeFileSync(`fixtures/claude/receipt-harness/${basename(img)}.${hash.slice(0, 8)}.json`, JSON.stringify(parsed.data, null, 1));
  }
}
const mean = results.reduce((a, b) => a + b, 0) / Math.max(1, results.length);
console.log(`\nMean line accuracy ${(mean * 100).toFixed(1)}% over ${results.length} slips (target ≥ 90%)`);
process.exit(mean >= 0.9 ? 0 : 1);
