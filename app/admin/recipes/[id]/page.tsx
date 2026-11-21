/** ADM-4: recipe editor with publish flag and a cost preview at a chosen branch. */
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { sql } from 'drizzle-orm';
import { getDb, query } from '@/lib/db';
import { requireAdmin } from '@/lib/admin/guard';
import { costPreview, getRecipe, recipeInput, saveRecipe, type RecipeInput } from '@/lib/admin/recipes';
import { formatRandShort } from '@/lib/money';
import { isoDateInSA } from '@/lib/period';

const parseForm = (f: FormData): RecipeInput => ({
  id: String(f.get('id') ?? '').trim(),
  name: String(f.get('name') ?? ''),
  description: String(f.get('description') ?? '').trim() || null,
  cookMinutes: Number(f.get('cookMinutes')),
  tags: String(f.get('tags') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  steps: String(f.get('steps') ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
  ingredients: String(f.get('ingredients') ?? '')
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[0])
    .map(([ingredientId, qty, opt]) => ({ ingredientId: ingredientId!, qtyPerServing: Number(qty), optional: opt === 'optional' })),
  published: f.get('published') === 'on',
});

export default async function EditRecipe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ branch?: string; people?: string; saved?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations('admin');
  const db = getDb();
  const recipe = id === 'new' ? null : await getRecipe(db, id);
  if (id !== 'new' && !recipe) notFound();
  const branches = await query<{ id: number; name: string }>(db, sql`select id, name from branches where active order by name limit 300`);

  async function save(f: FormData) {
    'use server';
    await requireAdmin();
    const parsed = recipeInput.safeParse(parseForm(f));
    if (!parsed.success) redirect(`/admin/recipes/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? 'invalid')}`);
    try {
      const saved = await saveRecipe(getDb(), parsed.data);
      redirect(`/admin/recipes/${saved}?saved=1`);
    } catch (e) {
      if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;
      redirect(`/admin/recipes/${id}?error=${encodeURIComponent((e as Error).message)}`);
    }
  }

  const branch = Number(sp.branch);
  const people = Math.min(12, Math.max(1, Number(sp.people) || 4));
  const preview = recipe && Number.isSafeInteger(branch) && branch > 0 ? await costPreview(db, recipe, branch, people, isoDateInSA(new Date())) : null;

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">{recipe?.name ?? t('newRecipe')}</h1>
      {sp.saved && <p className="rounded bg-teal-50 p-2">{t('saved')}</p>}
      {sp.error && <p className="rounded bg-red-50 p-2">{sp.error}</p>}
      <form action={save} className="grid gap-2">
        <label>{t('id')}<input name="id" defaultValue={recipe?.id ?? ''} readOnly={Boolean(recipe)} className="block w-full rounded border px-2 py-1" /></label>
        <label>{t('name')}<input name="name" defaultValue={recipe?.name ?? ''} className="block w-full rounded border px-2 py-1" /></label>
        <label>{t('description')}<input name="description" defaultValue={recipe?.description ?? ''} className="block w-full rounded border px-2 py-1" /></label>
        <label>{t('cookMinutes')}<input name="cookMinutes" type="number" defaultValue={recipe?.cookMinutes ?? 30} className="block w-32 rounded border px-2 py-1" /></label>
        <label>{t('tags')}<input name="tags" defaultValue={recipe?.tags.join(', ') ?? ''} className="block w-full rounded border px-2 py-1" /></label>
        <label>{t('steps')}<textarea name="steps" rows={6} defaultValue={recipe?.steps.join('\n') ?? ''} className="block w-full rounded border px-2 py-1" /></label>
        <label>{t('ingredientsHelp')}<textarea name="ingredients" rows={8} defaultValue={recipe?.ingredients.map((i) => `${i.ingredientId} ${i.qtyPerServing}${i.optional ? ' optional' : ''}`).join('\n') ?? ''} className="block w-full rounded border px-2 py-1 font-mono" /></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="published" defaultChecked={recipe?.published ?? false} /> {t('published')} <span className="text-sm text-gray-500">{t('publishHelp')}</span></label>
        <button className="w-32 rounded bg-brand px-3 py-2 font-semibold text-white">{t('save')}</button>
      </form>
      {recipe && (
        <section className="space-y-2 rounded border p-3">
          <h2 className="font-bold">{t('preview')}</h2>
          <form className="flex flex-wrap items-end gap-2">
            <label>{t('branch')}<select name="branch" defaultValue={sp.branch ?? ''} className="block rounded border px-2 py-1">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label>{t('people')}<input name="people" type="number" defaultValue={people} className="block w-20 rounded border px-2 py-1" /></label>
            <button className="rounded border px-3 py-1">{t('previewButton')}</button>
          </form>
          {preview && (
            <div data-testid="cost-preview">
              <p>{t('packs', { amount: formatRandShort(preview.packsCents) })}</p>
              <p>{t('perPlate', { amount: formatRandShort(preview.perPlateCents) })}</p>
              {preview.unpriced.length > 0 && <p className="text-danger">{t('unpriced', { items: preview.unpriced.join(', ') })}</p>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
