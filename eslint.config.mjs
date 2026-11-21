import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['.next/**', 'node_modules/**', 'packages/*/node_modules/**', 'public/sw.js', 'test-results/**', 'playwright-report/**'] },
  {
    rules: {
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**', 'packages/engine/bench/**'],
    rules: { 'no-console': 'off' },
  },
];
export default config;
