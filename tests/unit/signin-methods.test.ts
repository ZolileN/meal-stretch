import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { signInMethods } from '@/lib/auth/methods';

const withEnv = (vars: Record<string, string>) => {
  vi.unstubAllEnvs();
  for (const k of ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'RESEND_API_KEY', 'E2E']) vi.stubEnv(k, '');
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  resetEnvCache();
  return signInMethods();
};

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('sign-in methods', () => {
  it('offers nothing in production until keys are set', () => {
    expect(withEnv({ NODE_ENV: 'production' })).toEqual({ google: false, email: false });
  });
  it('offers Google once both Google keys are set', () => {
    expect(withEnv({ NODE_ENV: 'production', AUTH_GOOGLE_ID: 'id' })).toEqual({ google: false, email: false });
    expect(withEnv({ NODE_ENV: 'production', AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 's' })).toEqual({ google: true, email: false });
  });
  it('offers email in production only with a Resend key', () => {
    expect(withEnv({ NODE_ENV: 'production', RESEND_API_KEY: 're_x' }).email).toBe(true);
  });
  it('keeps email on in development (links go to the dev mailbox)', () => {
    expect(withEnv({ NODE_ENV: 'development' }).email).toBe(true);
  });
});
