'use client';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CoachMark } from '@/components/ui/CoachMark';
import { ListRow } from '@/components/ui/ListRow';
import { MoneyText } from '@/components/ui/MoneyText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Toast';

export function DemoInteractive() {
  const to = useTranslations('onboarding');
  const tl = useTranslations('list');
  const ta = useTranslations('actions');
  const tc = useTranslations('coach');
  const [on, setOn] = useState<string[]>(['avoidPork']);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [ticked, setTicked] = useState(false);
  const [open, setOpen] = useState(false);
  const clear = useCallback(() => setToast(null), []);
  const keys = ['avoidPork', 'avoidBeef', 'avoidFish', 'avoidNuts'] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <Chip key={k} selected={on.includes(k)} onClick={() => setOn((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))}>
            {to(k)}
          </Chip>
        ))}
      </div>
      <Card className="overflow-hidden">
        <ul>
          <ListRow
            checked={ticked}
            onToggle={() => setTicked(!ticked)}
            checkLabel={tl('tick', { name: 'TEST Beef mince' })}
            name="TEST Beef mince"
            detail={tl('packs', { count: 1, pack: '1 kg' })}
            tags={<Badge tone="special">{tl('special')}</Badge>}
            price={
              <>
                <MoneyText cents={8999} className="block font-semibold" />
                <MoneyText cents={10999} strike className="block text-caption" />
              </>
            }
            expanded={open}
            onExpand={() => setOpen(!open)}
            moreLabel={tl('more', { name: 'TEST Beef mince' })}
          >
            <Button variant="secondary">{tl('alreadyHave')}</Button>
          </ListRow>
        </ul>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setSheet(true)}>
          Sheet
        </Button>
        <Button variant="secondary" onClick={() => setToast(ta('swapped'))}>
          Toast
        </Button>
      </div>
      <CoachMark
        id="dev-demo"
        steps={[
          { title: tc('actionsTitle'), text: tc('actionsText') },
          { title: tc('listTitle'), text: tc('listText') },
        ]}
        labels={{ skip: tc('skip'), next: tc('next'), done: tc('done'), step: (n, total) => tc('step', { n, total }) }}
      />
      {sheet && (
        <Sheet title={ta('swapTitle', { name: 'Curry mince and rice' })} closeLabel={ta('close')} onClose={() => setSheet(false)}>
          <p className="pb-6 text-small text-text-muted">{ta('noOptions')}</p>
        </Sheet>
      )}
      <Toast message={toast} onDone={clear} />
    </div>
  );
}
