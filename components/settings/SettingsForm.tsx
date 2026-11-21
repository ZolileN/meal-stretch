'use client';
/** Settings (§7.8). */
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Stepper } from '@/components/Stepper';
import { useShops } from '@/components/location/LocationProvider';
import { AccountPrompt } from '@/components/account/AccountPrompt';

const AVOID = ['pork', 'beef', 'fish', 'nuts', 'dairy', 'gluten'] as const;
const KINDS = ['specials_day', 'tonight', 'month_end', 'payday', 'receipt_nudge'] as const;
const LANGS = ['en', 'xh', 'af'] as const;
const avoidKey = { pork: 'avoidPork', beef: 'avoidBeef', fish: 'avoidFish', nuts: 'avoidNuts', dairy: 'avoidDairy', gluten: 'avoidGluten' } as const;

export interface SettingsData {
  light: number;
  average: number;
  big: number;
  exclusions: string[];
  neverSwap: { id: string; name: string }[];
  paydayDom: number | null;
  optOut: string[];
  language: 'en' | 'xh' | 'af';
  shareLinks: { token: string }[];
  user: { email: string | null } | null;
  appUrl: string;
}

export function SettingsForm({ data }: { data: SettingsData }) {
  const t = useTranslations('settings');
  const to = useTranslations('onboarding');
  const router = useRouter();
  const { openSheet } = useShops();
  const [h, setH] = useState({ light: data.light, average: data.average, big: data.big });
  const [msg, setMsg] = useState<string | null>(null);
  const [sharePrompt, setSharePrompt] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const put = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/household', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setMsg(res.ok ? t('saved') : null);
    if (res.ok) router.refresh();
  };
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const people = h.light + h.average + h.big;

  const createShare = async () => {
    setSharePrompt(false);
    const res = await fetch('/api/share', { method: 'POST' });
    if (res.ok) router.refresh();
  };

  return (
    <div className="space-y-6">
      {msg && (
        <p role="status" className="rounded-lg bg-teal-50 p-2 text-sm">
          {msg}
        </p>
      )}
      <Section title={t('shops')}>
        <button type="button" className="tap rounded-xl border px-4 font-semibold" onClick={() => openSheet('shops')}>
          {t('changeShops')}
        </button>
      </Section>

      <Section title={t('household')}>
        {(['light', 'average', 'big'] as const).map((k) => (
          <div key={k} className="flex items-center justify-between">
            <span>{to(k)}</span>
            <Stepper value={h[k]} min={0} max={12} onChange={(v) => setH({ ...h, [k]: v })} label={to(k)} decLabel={to('fewer')} incLabel={to('more')} />
          </div>
        ))}
        <button type="button" disabled={people < 1 || people > 12} className="tap rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50" onClick={() => put(h)}>
          {t('save')}
        </button>
      </Section>

      <Section title={t('avoid')}>
        <div className="flex flex-wrap gap-2">
          {AVOID.map((a) => (
            <Chip key={a} on={data.exclusions.includes(a)} onClick={() => put({ exclusions: toggle(data.exclusions, a) })}>
              {to(avoidKey[a])}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('neverSwap')}>
        {data.neverSwap.length === 0 && <p className="text-sm text-gray-600">{t('noneNeverSwap')}</p>}
        <ul className="space-y-1">
          {data.neverSwap.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span>{p.name}</span>
              <button type="button" className="tap text-sm text-danger underline" aria-label={t('removeItem', { name: p.name })} onClick={() => put({ neverSwapProteins: data.neverSwap.filter((x) => x.id !== p.id).map((x) => x.id) })}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('payday')}>
        <label className="block text-sm text-gray-600">
          {t('paydayHelp')}
          <select className="tap mt-1 block rounded-xl border px-3" value={data.paydayDom ?? 25} onChange={(e) => put({ paydayDom: Number(e.target.value) })}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title={t('notifications')}>
        {KINDS.map((k) => (
          <label key={k} className="tap flex items-center justify-between">
            <span>{t(`kind_${k}`)}</span>
            <input type="checkbox" className="size-5" checked={!data.optOut.includes(k)} onChange={() => put({ notificationOptOut: toggle(data.optOut, k) })} />
          </label>
        ))}
      </Section>

      <Section title={t('language')}>
        <div className="flex gap-2">
          {LANGS.map((l) => (
            <Chip
              key={l}
              on={data.language === l}
              onClick={async () => {
                await fetch('/api/language', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: l }) });
                router.refresh();
              }}
            >
              {t(`lang_${l}`)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('share')}>
        <p className="text-sm text-gray-600">{t('shareHelp')}</p>
        {sharePrompt ? (
          <AccountPrompt signedIn={Boolean(data.user)} force onSkip={createShare} />
        ) : (
          <button type="button" className="tap rounded-xl border px-4 font-semibold" onClick={() => (data.user ? createShare() : setSharePrompt(true))}>
            {t('shareCreate')}
          </button>
        )}
        <ul className="space-y-2" data-testid="share-links">
          {data.shareLinks.map((l) => {
            const url = `${data.appUrl}/s/${l.token}`;
            return (
              <li key={l.token} className="flex items-center gap-2 text-sm">
                <code className="flex-1 truncate rounded bg-gray-100 px-2 py-1">{url}</code>
                <button type="button" className="tap rounded-lg border px-2" onClick={() => (void navigator.clipboard?.writeText(url), setCopied(l.token))}>
                  {copied === l.token ? t('shareCopied') : t('shareCopy')}
                </button>
                <button
                  type="button"
                  className="tap rounded-lg border px-2 text-danger"
                  onClick={async () => {
                    await fetch('/api/share', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: l.token }) });
                    router.refresh();
                  }}
                >
                  {t('shareRevoke')}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t('account')}>
        {data.user ? <AccountStatus email={data.user.email} /> : <Link href="/signin" className="tap inline-flex items-center font-semibold text-brand underline">{t('signIn')}</Link>}
      </Section>

      <Section title={t('privacy')}>
        <p className="text-sm text-gray-600">{t('privacyNote')}</p>
        <Link href="/privacy" className="tap inline-flex items-center text-sm text-brand underline">
          {t('privacyLink')}
        </Link>
        <a href="/api/account/export" className="tap inline-flex items-center rounded-xl border px-4 font-semibold">
          {t('export')}
        </a>
        <button
          type="button"
          className="tap block rounded-xl border border-danger px-4 font-semibold text-danger"
          onClick={async () => {
            if (!window.confirm(t('deleteConfirm'))) return;
            const res = await fetch('/api/account', { method: 'DELETE' });
            if (res.ok) {
              try {
                window.localStorage.clear();
              } catch {
                /* ignore */
              }
              setMsg(t('deleted'));
              router.push('/');
              router.refresh();
            }
          }}
        >
          {t('delete')}
        </button>
      </Section>
    </div>
  );
}

function AccountStatus({ email }: { email: string | null }) {
  const t = useTranslations('auth');
  return (
    <div className="space-y-2">
      <p>{t('signedInAs', { email: email ?? '' })}</p>
      <SignOutButton label={t('signOut')} />
    </div>
  );
}

function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="tap rounded-xl border px-4"
      onClick={async () => {
        const { csrfToken } = (await (await fetch('/api/auth/csrf')).json()) as { csrfToken: string };
        await fetch('/api/auth/signout', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, callbackUrl: '/' }) });
        router.push('/');
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`tap rounded-full border px-4 py-2 text-sm ${on ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}>
      {children}
    </button>
  );
}
