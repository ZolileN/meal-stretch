import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const alias = { '@': root };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'lib/**/*.test.ts'],
        },
      },
      {
        // Integration tests share one in-memory PGlite + PostGIS (≈15 s start), so run in one worker.
        resolve: { alias },
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
          fileParallelism: false,
          isolate: false,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      './packages/engine/vitest.config.ts',
    ],
  },
});
