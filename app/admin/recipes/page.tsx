import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import { getDb, query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { draftRecipes, MAX_DRAFTS } from '@/lib/admin/drafts';
import { ClaudeError } from '@/lib/claude';
import { features } from '@/lib/env';
import { track } from '@/lib/events';

export const dynamic = 'force-dynamic';

export default async function AdminRecipes({ searchParams }: { searchParams: Promise<{ drafted?: string; rejected?: string; error?: string }> }) {
  const sp = await searchParams;
  const t = await getTranslations('admin');
  const recipes = await query<{ id: string; name: string; published: boolean; cook_minutes: number; tags: string[] }>(
    getDb(),
    sql`select id, name, published, cook_minutes, tags from recipes order by published desc, name`,
  );
  const drafted = new Set((sp.drafted ?? '').split(',').filter(Boolean));

  async function draft(f: FormData) {
    'use server';
    await requireAdmin();
    const brief = String(f.get('brief') ?? '').trim();
    const count = Number(f.get('count')) || 3;
    if (brief.length < 5) redirect('/admin/recipes?error=brief');
    let to: string;
    try {
      const db = getDb();
      const { saved, rejected } = await draftRecipes(db, brief, count);
      await track(db, null, 'recipe_drafted', { saved: saved.length, rejected: rejected.length });
      to = `/admin/recipes?drafted=${saved.join(',')}&rejected=${rejected.length}`;
    } catch (e) {
      to = `/admin/recipes?error=${e instanceof ClaudeError ? e.code : 'failed'}`;
    }
    redirect(to);
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('recipes')}</h1>
        <Link href="/admin/recipes/new" className="rounded bg-primary px-3 py-2 font-semibold text-on-primary">{t('newRecipe')}</Link>
      </div>

      <section className="space-y-2 rounded border p-3" data-testid="draft-with-claude">
        <h2 className="font-bold">{t('draftTitle')}</h2>
        <p className="text-sm text-text-muted">{t('draftHelp')}</p>
        {!features.claude() && <p className="text-sm text-danger">{t('draftNoKey')}</p>}
        {sp.drafted !== undefined && <p className="rounded bg-surface-muted p-2" role="status">{t('drafted', { count: drafted.size, rejected: Number(sp.rejected) || 0 })}</p>}
        {sp.error && <p className="rounded bg-danger-soft p-2" role="alert">{sp.error === 'brief' ? t('draftBrief') : t('draftFailed')}</p>}
        <form action={draft} className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1">
            {t('draftBriefLabel')}
            <input name="brief" required minLength={5} maxLength={500} placeholder={t('draftPlaceholder')} className="block w-full rounded border px-2 py-1" />
          </label>
          <label>
            {t('draftCount')}
            <select name="count" defaultValue="3" className="block rounded border px-2 py-1">
              {Array.from({ length: MAX_DRAFTS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button className="rounded bg-primary px-3 py-2 font-semibold text-on-primary">{t('draftSubmit')}</button>
        </form>
      </section>

      <p className="text-sm text-text-muted">{t('recipeCounts', { total: recipes.length, published: recipes.filter((r) => r.published).length })}</p>
      <table className="w-full text-sm">
        <tbody>
          {recipes.map((r) => (
            <tr key={r.id} className={`border-b ${drafted.has(r.id) ? 'bg-savings-soft' : ''}`}>
              <td className="py-1">{r.name}</td>
              <td className="text-text-muted">{r.tags.find((x) => x.startsWith('cuisine:'))?.slice(8).replace(/_/g, ' ') ?? ''}</td>
              <td className="text-text-muted">{t('minutesShort', { count: Number(r.cook_minutes) })}</td>
              <td>{r.published ? t('published') : t('draft')}</td>
              <td><Link href={`/admin/recipes/${r.id}`} className="underline">{t('edit')}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
