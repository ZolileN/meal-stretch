'use client';
/** Settings (§7.8). */
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Stepper } from '@/components/Stepper';
import { useShops } from '@/components/location/LocationProvider';
import { AccountPrompt } from '@/components/account/AccountPrompt';
import { Download, Link2, LogOut, MapPin, Trash2, X } from 'lucide-react';
import { Button, ButtonLink, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Toast } from '@/components/ui/Toast';
import { usePhotosSetting, writePhotosSetting } from '@/components/ui/useImagesAllowed';
import { fieldClass } from '@/components/ui/field';
import type { SignInMethods } from '@/lib/auth/methods';

const AVOID = ['pork', 'beef', 'fish', 'shellfish', 'nuts', 'dairy', 'gluten'] as const;
const KINDS = ['specials_day', 'tonight', 'month_end', 'payday', 'receipt_nudge'] as const;
const LANGS = ['en', 'xh', 'af'] as const;
const avoidKey = { pork: 'avoidPork', beef: 'avoidBeef', fish: 'avoidFish', shellfish: 'avoidShellfish', nuts: 'avoidNuts', dairy: 'avoidDairy', gluten: 'avoidGluten' } as const;

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
  signInMethods: SignInMethods;
  appUrl: string;
}

export function SettingsForm({ data }: { data: SettingsData }) {
  const t = useTranslations('settings');
  const to = useTranslations('onboarding');
  const tAuth = useTranslations('auth');
  const canSignIn = data.signInMethods.google || data.signInMethods.email;
  const router = useRouter();
  const { openSheet } = useShops();
  const [h, setH] = useState({ light: data.light, average: data.average, big: data.big });
  const [msg, setMsg] = useState<string | null>(null);
  const [sharePrompt, setSharePrompt] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const photos = usePhotosSetting();
  const clear = useCallback(() => setMsg(null), []);

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
    <div className="space-y-3">
      <Toast message={msg} onDone={clear} />
      <Section title={t('account')}>
        {data.user ? <AccountStatus email={data.user.email} /> : canSignIn ? <ButtonLink href="/signin">{t('signIn')}</ButtonLink> : <p className="text-small text-text-muted">{tAuth('unavailable')}</p>}
      </Section>

      <Section title={t('shops')}>
        <Button variant="secondary" onClick={() => openSheet('shops')} icon={<MapPin aria-hidden className="size-4" />}>
          {t('changeShops')}
        </Button>
      </Section>

      <Section title={t('household')}>
        {(['light', 'average', 'big'] as const).map((k) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{to(k)}</span>
            <Stepper value={h[k]} min={0} max={12} onChange={(v) => setH({ ...h, [k]: v })} label={to(k)} decLabel={to('fewer')} incLabel={to('more')} />
          </div>
        ))}
        <Button disabled={people < 1 || people > 12} onClick={() => put(h)}>
          {t('save')}
        </Button>
      </Section>

      <Section title={t('avoid')}>
        <div className="flex flex-wrap gap-2">
          {AVOID.map((a) => (
            <Chip key={a} selected={data.exclusions.includes(a)} onClick={() => put({ exclusions: toggle(data.exclusions, a) })}>
              {to(avoidKey[a])}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title={t('neverSwap')}>
        {data.neverSwap.length === 0 && <p className="text-small text-text-muted">{t('noneNeverSwap')}</p>}
        <ul className="divide-y divide-border">
          {data.neverSwap.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-1">
              <span>{p.name}</span>
              <button type="button" className="press tap grid place-items-center rounded-full text-danger hover:bg-danger-soft" aria-label={t('removeItem', { name: p.name })} onClick={() => put({ neverSwapProteins: data.neverSwap.filter((x) => x.id !== p.id).map((x) => x.id) })}>
                <X aria-hidden className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('payday')}>
        <label className="block text-small text-text-muted">
          {t('paydayHelp')}
          <select className={`${fieldClass} mt-1.5 max-w-32`} value={data.paydayDom ?? 25} onChange={(e) => put({ paydayDom: Number(e.target.value) })}>
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
          <label key={k} className="tap flex cursor-pointer items-center justify-between gap-3">
            <span>{t(`kind_${k}`)}</span>
            <input type="checkbox" className="size-5 accent-primary" checked={!data.optOut.includes(k)} onChange={() => put({ notificationOptOut: toggle(data.optOut, k) })} />
          </label>
        ))}
      </Section>

      <Section title={t('photos')}>
        <label className="tap flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block">{t('photosToggle')}</span>
            <span className="block text-small text-text-muted">{t('photosHelp')}</span>
          </span>
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={photos}
            onChange={(e) => writePhotosSetting(e.target.checked)}
          />
        </label>
      </Section>

      <Section title={t('language')}>
        <div className="flex gap-2">
          {LANGS.map((l) => (
            <Chip
              key={l}
              selected={data.language === l}
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
        <p className="text-small text-text-muted">{t('shareHelp')}</p>
        {sharePrompt ? (
          <AccountPrompt signedIn={Boolean(data.user)} methods={data.signInMethods} force onSkip={createShare} />
        ) : (
          <Button variant="secondary" onClick={() => (data.user || !canSignIn ? createShare() : setSharePrompt(true))} icon={<Link2 aria-hidden className="size-4" />}>
            {t('shareCreate')}
          </Button>
        )}
        <ul className="space-y-2" data-testid="share-links">
          {data.shareLinks.map((l) => {
            const url = `${data.appUrl}/s/${l.token}`;
            return (
              <li key={l.token} className="flex flex-wrap items-center gap-2 text-small">
                <code className="min-w-0 flex-1 truncate rounded-input bg-surface-muted px-3 py-2">{url}</code>
                <Button variant="secondary" onClick={() => (void navigator.clipboard?.writeText(url), setCopied(l.token))}>
                  {copied === l.token ? t('shareCopied') : t('shareCopy')}
                </Button>
                <Button
                  variant="ghost"
                  className="text-danger"
                  onClick={async () => {
                    await fetch('/api/share', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: l.token }) });
                    router.refresh();
                  }}
                >
                  {t('shareRevoke')}
                </Button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t('privacy')}>
        <p className="text-small text-text-muted">{t('privacyNote')}</p>
        <Link href="/privacy" className="tap inline-flex items-center text-small font-semibold text-primary underline">
          {t('privacyLink')}
        </Link>
        <div className="flex flex-wrap gap-2">
        <a href="/api/account/export" className={buttonClass('secondary')}>
          <Download aria-hidden className="size-4" />
          {t('export')}
        </a>
        <Button
          variant="ghost"
          className="text-danger hover:bg-danger-soft"
          icon={<Trash2 aria-hidden className="size-4" />}
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
        </Button>
        </div>
      </Section>
    </div>
  );
}

function AccountStatus({ email }: { email: string | null }) {
  const t = useTranslations('auth');
  return (
    <div className="space-y-2">
      <p className="text-small">{t('signedInAs', { email: email ?? '' })}</p>
      <SignOutButton label={t('signOut')} />
    </div>
  );
}

function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      icon={<LogOut aria-hidden className="size-4" />}
      onClick={async () => {
        const { csrfToken } = (await (await fetch('/api/auth/csrf')).json()) as { csrfToken: string };
        await fetch('/api/auth/signout', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, callbackUrl: '/' }) });
        router.push('/');
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-5">
      <h2 className="font-heading text-h3 font-bold text-primary">{title}</h2>
      {children}
    </Card>
  );
}

