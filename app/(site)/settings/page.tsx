import { getTranslations } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import { getDb, query } from '@/lib/db';
import { env } from '@/lib/env';
import { currentHousehold } from '@/lib/household';
import { sessionUser } from '@/lib/auth/session';
import { listShareLinks } from '@/lib/share';
import { pgArray } from '@/lib/location/queries';
import { SettingsForm } from '@/components/settings/SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const db = getDb();
  const [h, user, t] = await Promise.all([currentHousehold(db), sessionUser(), getTranslations('settings')]);
  const names = h?.neverSwapProteins.length
    ? await query<{ id: string; name: string }>(db, sql`select id, name from ingredients where id = any(${pgArray(h.neverSwapProteins)}::text[])`)
    : [];
  return (
    <main className="space-y-3 px-gutter pt-2 pb-4">
      <h1 className="font-heading text-h1 font-extrabold text-primary">{t('title')}</h1>
      <SettingsForm
        data={{
          light: h?.light ?? 0,
          average: h?.average ?? 1,
          big: h?.big ?? 0,
          exclusions: h?.exclusions ?? [],
          neverSwap: names,
          paydayDom: h?.paydayDom ?? null,
          optOut: h?.notificationOptOut ?? [],
          language: h?.language ?? 'en',
          shareLinks: h ? await listShareLinks(db, h.id) : [],
          user: user ? { email: user.email } : null,
          appUrl: env().APP_URL,
        }}
      />
    </main>
  );
}
