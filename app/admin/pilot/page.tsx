/** Pilot dashboard (§16). */
import { getTranslations } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { pilotMetrics } from '@/lib/pilot';

function Bars({ rows }: { rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0">{r.label}</span>
          <span className="h-4 bg-primary" style={{ width: `${(r.n / max) * 70}%` }} />
          <span>{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function Pilot() {
  const t = await getTranslations('admin');
  const m = await pilotMetrics(getDb());
  const pct = (v: number | null) => (v === null ? t('na') : `${v}%`);
  const funnel = ['started', 'activated', 'planned', 'shopped', 'receipts', 'accounts'] as const;
  return (
    <main className="space-y-6" data-testid="pilot">
      <h1 className="text-2xl font-bold">{t('pilot')}</h1>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t('activation')} value={pct(m.activationPct)} />
        <Tile label={t('budgetFit')} value={pct(m.budgetFitPct)} />
        <Tile label={t('matchRate')} value={pct(m.receiptMatchRatePct)} />
        <Tile label={t('medianList', { items: m.medianItems7DaysFamily4 ?? t('na') })} value={String(m.medianItems7DaysFamily4 ?? t('na'))} />
      </section>
      <section>
        <Bars rows={funnel.map((k) => ({ label: t(k), n: m.funnel[k] ?? 0 }))} />
      </section>
      <section>
        <h2 className="font-bold">{t('retention')}</h2>
        <table className="text-sm">
          <thead><tr><th className="pr-3 text-left">{t('cohort')}</th><th className="pr-3">{t('size_label')}</th><th className="pr-3">W1</th><th className="pr-3">W2</th><th className="pr-3">W3</th><th>W4</th></tr></thead>
          <tbody>
            {m.retention.map((r) => (
              <tr key={r.cohort}>
                <td className="pr-3">{r.cohort}</td><td className="pr-3 text-center">{r.size}</td>
                {[r.w1, r.w2, r.w3, r.w4].map((w, i) => <td key={i} className="pr-3 text-center">{r.size ? Math.round((Number(w) / Number(r.size)) * 100) : 0}%</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="font-bold">{t('savingsDist')}</h2>
        <Bars rows={m.savings.map((s) => ({ label: s.bucket, n: Number(s.n) }))} />
      </section>
      <section>
        <h2 className="font-bold">{t('listSize')}</h2>
        <Bars rows={m.listSize.map((s) => ({ label: String(s.items), n: Number(s.n) }))} />
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
