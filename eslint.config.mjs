import next from 'eslint-config-next';

const config = [
  ...next,
  { ignores: ['.next/**', 'node_modules/**', 'packages/*/node_modules/**', 'test-results/**', 'playwright-report/**'] },
  {
    rules: {
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
    },
  },
  { files: ['public/sw.js'], languageOptions: { globals: { self: 'readonly', caches: 'readonly', clients: 'readonly' } } },
  {
    files: ['scripts/**', 'packages/engine/bench/**'],
    rules: { 'no-console': 'off' },
  },
];
export default config;
