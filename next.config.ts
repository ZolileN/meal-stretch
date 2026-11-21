import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  transpilePackages: ['@mealstretch/engine'],
  serverExternalPackages: ['@electric-sql/pglite', '@electric-sql/pglite-postgis'],
};

export default withNextIntl(nextConfig);
