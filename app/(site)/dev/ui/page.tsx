/**
 * Component demo (docs/THEME.md §2), dev/E2E only. Section labels are component names for
 * developers; sample content reuses real message strings. Not user-facing.
 */
import { getTranslations } from 'next-intl/server';
import { Clock, PackageCheck, Repeat, TrendingDown, Zap } from 'lucide-react';
import { COLORS, TEXT_PAIRS } from '@/lib/brand';
import { devOnly } from '@/lib/dev/guard';
import { contrastRatio } from '@/lib/contrast';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { HeroCard } from '@/components/ui/HeroCard';
import { MoneyText } from '@/components/ui/MoneyText';
import { SavingsChip } from '@/components/ui/SavingsChip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ShortcutTile } from '@/components/ui/ShortcutTile';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatRing } from '@/components/ui/StatRing';
import { TopBar } from '@/components/ui/TopBar';
import { Wordmark } from '@/components/ui/Wordmark';
import { DemoInteractive } from './DemoInteractive';

export const dynamic = 'force-dynamic';

const Demo = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <section className="space-y-3" aria-label={name}>
    <h2 className="font-mono text-caption font-bold text-text-muted">{name}</h2>
    {children}
  </section>
);

export default async function DevUi() {
  devOnly();
  const [tp, th, tl, ts] = await Promise.all([getTranslations('plan'), getTranslations('home'), getTranslations('list'), getTranslations('savings')]);
  return (
    <main className="space-y-8 px-gutter pt-2 pb-8">
      <h1 className="font-heading text-h1 font-extrabold text-primary">components/ui</h1>

      <Demo name="Wordmark">
        <Wordmark />
      </Demo>

      <Demo name="Colour tokens">
        <ul className="grid grid-cols-2 gap-2">
          {Object.keys(COLORS).map((k) => (
            <li key={k} className="flex items-center gap-2 text-caption">
              <span className="size-8 shrink-0 rounded-img border border-border" style={{ background: `var(--ms-${k})` }} />
              <code>{k}</code>
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-caption">
          {TEXT_PAIRS.map((p) => (
            <li key={`${p.fg}/${p.bg}`} className="flex items-center gap-2 rounded-img px-2 py-1" style={{ background: `var(--ms-${p.bg})`, color: `var(--ms-${p.fg})` }}>
              <span className="flex-1">
                {p.fg} / {p.bg}
              </span>
              <span className="money font-bold">{contrastRatio(COLORS[p.fg], COLORS[p.bg]).toFixed(1)}:1</span>
            </li>
          ))}
        </ul>
      </Demo>

      <Demo name="Button">
        <Button size="lg">{th('start')}</Button>
        <div className="flex flex-wrap gap-2">
          <Button>{tp('swap')}</Button>
          <Button variant="secondary">{tp('cheaper')}</Button>
          <Button variant="ghost">{tp('remove')}</Button>
          <Button variant="danger">{tp('fitBudget')}</Button>
          <Button loading loadingLabel={tp('fitting')}>
            {tp('fitBudget')}
          </Button>
          <Button disabled>{tp('swap')}</Button>
        </div>
      </Demo>

      <Demo name="Card">
        <Card>
          <CardHeader>
            <SectionHeader title={tp('yourSuppers')} variant="title" />
          </CardHeader>
          <CardBody>
            <p className="text-small text-text-muted">{th('intro')}</p>
          </CardBody>
        </Card>
      </Demo>

      <Demo name="Chip (interactive) · Sheet · Toast · CoachMark">
        <DemoInteractive />
      </Demo>

      <Demo name="Badge">
        <div className="flex flex-wrap gap-2">
          <Badge tone="count">3</Badge>
          <Badge tone="active">ACTIVE</Badge>
          <Badge tone="special">{tl('special')}</Badge>
          <Badge tone="member">{tl('member')}</Badge>
          <Badge tone="stale">{tl('stale')}</Badge>
          <Badge tone="info">MEAL PLAN</Badge>
          <Badge tone="danger">over</Badge>
        </div>
      </Demo>

      <Demo name="SavingsChip · MoneyText · StatRing">
        <div className="flex flex-wrap items-center gap-3">
          <SavingsChip cents={2000} />
          <SavingsChip>{tp('youSave', { amount: 'R118', pct: 23 })}</SavingsChip>
          <MoneyText cents={123450} short={false} className="font-bold" />
          <MoneyText cents={4599} strike strikeLabel={tl('wasLabel')} />
          <StatRing pct={23} label={tp('savingsRing', { pct: 23 })} />
          <StatRing pct={0} size={64} stroke={8} label={tp('savingsRing', { pct: 0 })} />
        </div>
      </Demo>

      <Demo name="TopBar">
        <TopBar backHref="/dev/ui" backLabel="Back" title={tl('title')} right={<Badge tone="count">7</Badge>} />
      </Demo>

      <Demo name="HeroCard (no image → solid green)">
        <HeroCard
          eyebrow={th('upNextEyebrow')}
          title="Curry mince and rice"
          meta={
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-4" /> {tp('minutes', { count: 35 })}
            </span>
          }
          actions={
            <>
              <ButtonLink href="/dev/ui" variant="inverse">
                {th('startCooking')}
              </ButtonLink>
              <Button variant="translucent" icon={<Repeat aria-hidden className="size-4" />}>
                {tp('swap')}
              </Button>
            </>
          }
        />
      </Demo>

      <Demo name="ShortcutTile">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-3">
          <ShortcutTile icon={<TrendingDown className="size-5" />} title={th('cheaperWeek')} subtitle={th('cheaperWeekSub')} />
          <ShortcutTile icon={<PackageCheck className="size-5" />} title={th('useWhatIHave')} subtitle={th('useWhatIHaveSub')} href="/dev/ui" />
          <ShortcutTile icon={<Zap className="size-5" />} title={th('quick')} subtitle={th('quickSub')} />
        </div>
      </Demo>

      <Demo name="SectionHeader">
        <SectionHeader title="PLAN WEEK" />
        <SectionHeader title={th('comingUp')} variant="title" action={{ href: '/dev/ui', label: th('seeAll') }} />
      </Demo>

      <Demo name="EmptyState · Skeleton">
        <EmptyState title={ts('nothingYetTitle')} text={ts('nothingYet')} />
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </Demo>
    </main>
  );
}
