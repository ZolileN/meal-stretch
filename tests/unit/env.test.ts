import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@/lib/env';

describe('env', () => {
  it('accepts an empty env with defaults', () => {
    const e = parseEnv({});
    expect(e.ENABLE_WEB_IMPORTERS).toBe('false');
    expect(e.CLAUDE_MODEL_FAST).toBeTruthy();
    expect(e.APP_URL).toBe('http://localhost:3000');
  });
  it('treats empty strings as unset', () => {
    expect(parseEnv({ ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
  });
  it('refuses to enable web importers (legal gate)', () => {
    expect(() => parseEnv({ ENABLE_WEB_IMPORTERS: 'true' })).toThrow(EnvError);
    expect(() => parseEnv({ ENABLE_WEB_IMPORTERS: 'true' })).toThrow(/legal/);
  });
  it('fails fast with a clear message on a bad DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });
});
