import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EVENT_NAMES } from '@/lib/events';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('every §16 analytics event is emitted somewhere', () => {
  const src = ['app', 'lib', 'components', 'auth.ts']
    .flatMap((d) => (d.endsWith('.ts') ? [d] : files(d)))
    .filter((f) => !f.endsWith('lib/events.ts'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  it.each([...EVENT_NAMES])('%s', (name) => {
    expect(src.includes(`'${name}'`) || src.includes(`"${name}"`)).toBe(true);
  });
});
