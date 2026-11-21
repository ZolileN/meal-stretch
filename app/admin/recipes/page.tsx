import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { listRecipes } from '@/lib/admin/recipes';

export default async function AdminRecipes() {
  const t = await getTranslations('admin');
  const recipes = await listRecipes(getDb());
  return (
    <main className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('recipes')}</h1>
        <Link href="/admin/recipes/new" className="rounded bg-primary px-3 py-2 font-semibold text-on-primary">{t('newRecipe')}</Link>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {recipes.map((r) => (
            <tr key={r.id} className="border-b">
              <td className="py-1">{r.name}</td>
              <td className="text-text-muted">{r.id}</td>
              <td>{r.published ? t('published') : t('draft')}</td>
              <td><Link href={`/admin/recipes/${r.id}`} className="underline">{t('edit')}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
