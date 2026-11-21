import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';
import { households, householdContext } from '../fixtures';

/** Golden plans for the 5 fixture households (BUILD 3.5). Review diffs in test/golden/*.json before updating. */
describe('golden plans', () => {
  const engine = createEngine();
  for (const [name, req] of Object.entries(households)) {
    it(name, async () => {
      const result = engine.plan(req, householdContext(req));
      await expect(JSON.stringify(result, null, 1) + '\n').toMatchFileSnapshot(`golden/${name}.json`);
    });
  }
});
