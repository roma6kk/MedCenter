'use client';

import { useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClinic } from '@/components/catalog/use-clinic';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';
import { buildMyDataExport, myDataFileName } from './build-my-data-export';
import { collectMyData } from './collect-my-data';

function saveJson(content: string, fileName: string): void {
  const address: string = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const anchor: HTMLAnchorElement = document.createElement('a');
  anchor.href = address;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(address), 0);
}

type Phase = 'idle' | 'busy' | 'saved' | 'failed';

// Built in the browser from what the session can already read: no new server-side copy of the data is made.
export function MyDataSection(): ReactNode {
  const t = useT('myData');
  const locale = useUiStore((state) => state.locale);
  const clinic = useClinic();
  const [phase, setPhase] = useState<Phase>('idle');
  const download = async (): Promise<void> => {
    if (phase === 'busy') return;
    setPhase('busy');
    try {
      const now = new Date();
      saveJson(JSON.stringify(buildMyDataExport(await collectMyData(), locale, now, clinic), null, 2), myDataFileName(now));
      setPhase('saved');
    } catch {
      setPhase('failed');
    }
  };
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="my-data-title" id="my-data" className="flex flex-col gap-3 p-[22px]">
      <h2 id="my-data-title" className="text-lg font-bold">{t('title')}</h2>
      <p className="text-sm">{t('lead')}</p>
      <div>
        <Button variant="secondary" aria-disabled={phase === 'busy' ? true : undefined} aria-busy={phase === 'busy'} onClick={() => void download()}>
          <Download aria-hidden="true" className="size-4" />
          {phase === 'busy' ? t('preparing') : t('download')}
        </Button>
      </div>
      <p role={phase === 'failed' ? 'alert' : 'status'} className={phase === 'failed' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {phase === 'saved' ? t('saved') : phase === 'failed' ? t('failed') : ''}
      </p>
    </Card>
  );
}
