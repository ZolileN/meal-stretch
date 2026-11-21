'use client';
/** Shown only once a plan exists: install prompt (§6) and push permission with an explanation first (§14). */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell, Download } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
declare global {
  interface Window {
    __msInstall?: InstallEvent;
  }
}

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PlanExtras() {
  return (
    <>
      <PushPrompt />
      <InstallPrompt />
    </>
  );
}

function InstallPrompt() {
  const t = useTranslations('push');
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    if (read('ms_install_dismissed')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.__msInstall) setEvt(window.__msInstall);
    const on = () => setEvt(window.__msInstall ?? null);
    window.addEventListener('ms:installable', on);
    return () => window.removeEventListener('ms:installable', on);
  }, []);
  if (!evt) return null;
  return (
    <Card className="p-5" data-testid="install-prompt">
      <ExtraTitle icon={<Download className="size-5" />}>{t('installTitle', { brand: BRAND.name })}</ExtraTitle>
      <p className="mt-1 text-small text-text-muted">{t('installBody')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            await evt.prompt();
            window.__msInstall = undefined;
            setEvt(null);
          }}
        >
          {t('install')}
        </Button>
        <Button variant="ghost" onClick={() => (write('ms_install_dismissed', '1'), setEvt(null))}>
          {t('notNow')}
        </Button>
      </div>
    </Card>
  );
}

function PushPrompt() {
  const t = useTranslations('push');
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [stage, setStage] = useState<'hidden' | 'card' | 'explain' | 'done' | 'denied'>('hidden');
  useEffect(() => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    if (!supported || !key || read('ms_push_dismissed') || Notification.permission === 'denied') return;
    let live = true;
    // Show the card unless this device is already subscribed.
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => live && !sub && setStage('card'))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);

  const allow = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      void fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'push_permission', props: { granted: false } }) }).catch(() => undefined);
      setStage('denied');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key!) });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
    setStage('done');
  };

  if (stage === 'hidden') return null;
  if (stage === 'done' || stage === 'denied')
    return (
      <p role="status" className="rounded-input bg-surface-muted px-4 py-3 text-small text-text">
        {stage === 'done' ? t('allowed') : t('denied')}
      </p>
    );
  if (stage === 'card')
    return (
      <Card className="p-5" data-testid="push-card">
        <ExtraTitle icon={<Bell className="size-5" />}>{t('cardTitle')}</ExtraTitle>
        <p className="mt-1 text-small text-text-muted">{t('cardBody')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setStage('explain')}>{t('more')}</Button>
          <Button variant="ghost" onClick={() => (write('ms_push_dismissed', '1'), setStage('hidden'))}>
            {t('notNow')}
          </Button>
        </div>
      </Card>
    );
  return (
    <Card className="border-primary-soft p-5" data-testid="push-explain">
      <ExtraTitle icon={<Bell className="size-5" />}>{t('explainTitle', { brand: BRAND.name })}</ExtraTitle>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-small">
        <li>{t('explain1')}</li>
        <li>{t('explain2')}</li>
        <li>{t('explain3')}</li>
        <li>{t('explain4')}</li>
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={allow}>{t('allow')}</Button>
        <Button variant="ghost" onClick={() => (write('ms_push_dismissed', '1'), setStage('hidden'))}>
          {t('notNow')}
        </Button>
      </div>
    </Card>
  );
}

function ExtraTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-heading text-h3 font-bold text-primary">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted">
        {icon}
      </span>
      {children}
    </h2>
  );
}
