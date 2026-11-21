import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ENGINE_VERSION } from '../src/index';

describe('engine package', () => {
  it('exports a version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('runs fast-check properties', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a));
  });
});
