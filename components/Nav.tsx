import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function Nav() {
  const t = await getTranslations('nav');
  const items = [
    ['/plan', t('plan')],
    ['/list', t('list')],
    ['/savings', t('savings')],
    ['/settings', t('settings')],
  ] as const;
  return (
    <nav className="sticky bottom-0 z-20 grid grid-cols-4 border-t bg-white text-center text-sm" aria-label={t('label')}>
      {items.map(([href, label]) => (
        <Link key={href} href={href} className="tap flex items-center justify-center py-2 font-semibold text-gray-700">
          {label}
        </Link>
      ))}
    </nav>
  );
}
