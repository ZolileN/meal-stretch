'use client';
/**
 * Floating pill nav (THEME §2.7, §6.4): Home · Plan · Tonight · List · Savings.
 * Its real height is published as --nav-h so pages and sticky footers always clear it (§5).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { CalendarDays, CookingPot, House, PiggyBank, ShoppingBasket } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/', key: 'home', Icon: House },
  { href: '/plan', key: 'plan', Icon: CalendarDays },
  { href: '/tonight', key: 'tonight', Icon: CookingPot },
  { href: '/list', key: 'list', Icon: ShoppingBasket },
  { href: '/savings', key: 'savings', Icon: PiggyBank },
] as const;
export type NavKey = (typeof ITEMS)[number]['key'];

/** Routes with their own sticky action (onboarding, sign-in) hide the nav. */
export const NAV_HIDDEN = [/^\/start(\/|$)/, /^\/signin(\/|$)/];

export function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  if (href === '/tonight') return pathname === '/tonight' || pathname.startsWith('/recipe/');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({ labels, label }: { labels: Record<NavKey, string>; label: string }) {
  const pathname = usePathname() ?? '/';
  const ref = useRef<HTMLElement>(null);
  const hidden = NAV_HIDDEN.some((r) => r.test(pathname));

  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => root.style.setProperty('--nav-h', `${el.firstElementChild?.getBoundingClientRect().height ?? 64}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--nav-h');
    };
  }, [hidden]);

  if (hidden) return null;
  return (
    <nav ref={ref} data-bottom-nav aria-label={label} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
      <ul className="pointer-events-auto mx-auto grid min-h-16 max-w-md grid-cols-5 items-stretch gap-1 rounded-pill bg-primary p-1.5 shadow-float">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={key} className="flex">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'press flex min-h-[52px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-pill px-1 text-caption font-semibold',
                  active ? 'bg-primary-soft text-on-primary' : 'text-on-primary/80 hover:text-on-primary',
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
                <span className="max-w-full truncate">{labels[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
