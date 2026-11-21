/**
 * Minimal Auth.js adapter on our tables (parameterised SQL, no interactive transactions, so it works on
 * Neon's HTTP driver and PGlite). JWT sessions, so session methods are not needed.
 */
import type { Adapter, AdapterAccount, AdapterUser, VerificationToken } from 'next-auth/adapters';
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';

type Row = { id: string; email: string; name: string | null; email_verified: string | Date | null; image: string | null };
const toUser = (r: Row): AdapterUser => ({
  id: r.id,
  email: r.email,
  name: r.name,
  image: r.image,
  emailVerified: r.email_verified ? new Date(r.email_verified) : null,
});

export function dbAdapter(db: () => Db): Adapter {
  return {
    async createUser(u) {
      const [r] = await query<Row>(
        db(),
        sql`insert into users (email, name, email_verified, image) values (${u.email.toLowerCase()}, ${u.name ?? null}, ${u.emailVerified?.toISOString() ?? null}::timestamptz, ${u.image ?? null})
            on conflict (email) do update set name = coalesce(users.name, excluded.name) returning *`,
      );
      return toUser(r!);
    },
    async getUser(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const [r] = await query<Row>(db(), sql`select * from users where id = ${id}::uuid`);
      return r ? toUser(r) : null;
    },
    async getUserByEmail(email) {
      const [r] = await query<Row>(db(), sql`select * from users where email = ${email.toLowerCase()}`);
      return r ? toUser(r) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const [r] = await query<Row>(
        db(),
        sql`select u.* from users u join accounts a on a.user_id = u.id where a.provider = ${provider} and a.provider_account_id = ${providerAccountId}`,
      );
      return r ? toUser(r) : null;
    },
    async updateUser(u) {
      const [r] = await query<Row>(
        db(),
        sql`update users set name = coalesce(${u.name ?? null}, name), image = coalesce(${u.image ?? null}, image),
              email_verified = coalesce(${u.emailVerified?.toISOString() ?? null}::timestamptz, email_verified)
            where id = ${u.id}::uuid returning *`,
      );
      return toUser(r!);
    },
    async linkAccount(a: AdapterAccount) {
      await db().execute(
        sql`insert into accounts (user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
            values (${a.userId}::uuid, ${a.type}, ${a.provider}, ${a.providerAccountId}, ${a.refresh_token ?? null}, ${a.access_token ?? null},
                    ${a.expires_at ?? null}, ${a.token_type ?? null}, ${a.scope ?? null}, ${a.id_token ?? null}, ${(a.session_state as string | undefined) ?? null})
            on conflict (provider, provider_account_id) do nothing`,
      );
    },
    async createVerificationToken(t: VerificationToken) {
      await db().execute(sql`insert into verification_tokens (identifier, token, expires) values (${t.identifier}, ${t.token}, ${t.expires.toISOString()}::timestamptz)`);
      return t;
    },
    async useVerificationToken({ identifier, token }) {
      const [r] = await query<{ identifier: string; token: string; expires: string | Date }>(
        db(),
        sql`delete from verification_tokens where identifier = ${identifier} and token = ${token} returning *`,
      );
      return r ? { identifier: r.identifier, token: r.token, expires: new Date(r.expires) } : null;
    },
  };
}
