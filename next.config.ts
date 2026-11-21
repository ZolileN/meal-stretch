import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin({
  requestConfig: './i18n/request.ts',
  // Precompile ICU messages at build time: keeps the message parser out of first-load JS (PRD §15 budget).
  experimental: { messages: { path: './messages/runtime', format: 'json', locales: 'infer', sourceLocale: 'en', precompile: true } },
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  transpilePackages: ['@mealstretch/engine'],
  serverExternalPackages: ['@electric-sql/pglite', '@electric-sql/pglite-postgis'],
};

export default withNextIntl(nextConfig);
