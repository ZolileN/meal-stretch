import { z } from 'zod';

/**
 * Environment validation (Zod, fail fast with clear messages).
 * Keep in sync with .env.example. Optional keys enable features; when missing, the
 * feature runs in mock/fixture mode and the key is listed in docs/human-todo.md.
 */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.preprocess(emptyToUndefined, z.string().url().default('http://localhost:3000')),

  // Database: Neon in production; local PGlite HTTP shim in dev (see scripts/local-db.ts).
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// connection string').optional(),
  ),
  /** Only for local dev: Neon-compatible HTTP endpoint, e.g. http://localhost:4444/sql */
  DATABASE_HTTP_ENDPOINT: optionalUrl,

  // Location
  GOOGLE_PLACES_API_KEY: optionalString,

  // Claude
  ANTHROPIC_API_KEY: optionalString,
  CLAUDE_MODEL_VISION: z.preprocess(emptyToUndefined, z.string().default('claude-sonnet-5-5')),
  CLAUDE_MODEL_FAST: z.preprocess(emptyToUndefined, z.string().default('claude-haiku-5-5')),

  /** Legal gate (PRD §10.2 / §18): retailer website importers must stay disabled. */
  ENABLE_WEB_IMPORTERS: z.preprocess(
    emptyToUndefined,
    z.literal('false', { message: 'ENABLE_WEB_IMPORTERS must stay "false" until legal sign-off (PRD §18 #1)' }).default('false'),
  ),

  // Auth.js
  AUTH_SECRET: optionalString,
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().default('MealStretch <hello@example.com>')),
  ADMIN_EMAILS: z.preprocess(emptyToUndefined, z.string().default('')),

  // Receipts
  BLOB_READ_WRITE_TOKEN: optionalString,

  // Web push
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: z.preprocess(emptyToUndefined, z.string().default('mailto:hello@example.com')),

  // Cron
  CRON_SECRET: optionalString,

  // Observability
  SENTRY_DSN: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new EnvError(`Invalid environment variables:\n${lines.join('\n')}\nSee .env.example.`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Validated server env. Throws on first access if invalid. */
export function env(): ServerEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}

export function requireDatabaseUrl(): string {
  const url = env().DATABASE_URL;
  if (!url) throw new EnvError('DATABASE_URL is not set. Run `pnpm db:local` and copy .env.example to .env.local.');
  return url;
}

export function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const features = {
  googlePlaces: () => Boolean(env().GOOGLE_PLACES_API_KEY),
  claude: () => Boolean(env().ANTHROPIC_API_KEY),
  blob: () => Boolean(env().BLOB_READ_WRITE_TOKEN),
  push: () => Boolean(env().NEXT_PUBLIC_VAPID_PUBLIC_KEY && env().VAPID_PRIVATE_KEY),
  googleAuth: () => Boolean(env().AUTH_GOOGLE_ID && env().AUTH_GOOGLE_SECRET),
  emailAuth: () => Boolean(env().RESEND_API_KEY),
  webImporters: () => false as const,
};
