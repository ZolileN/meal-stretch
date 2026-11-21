import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** CLAUDE.md: the engine is pure — no I/O, no clock, no Math.random, no app/DB/LLM imports. */
describe('engine purity', () => {
  const dir = join(__dirname, '..', 'src');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  it.each(files)('%s', (f) => {
    const src = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/Math\.random\s*\(/);
    expect(src).not.toMatch(/new Date\(\s*\)/);
    expect(src).not.toMatch(/performance\.now/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/from ['"](next|next\/.*|node:.*|fs|path|@anthropic-ai\/.*|@neondatabase\/.*|drizzle-orm.*|@\/.*)['"]/);
    expect(src).not.toMatch(/process\.env/);
  });
});
