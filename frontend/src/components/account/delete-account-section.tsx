'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { DeleteAccountDialog } from './delete-account-dialog';

const OPENER_ID = 'delete-account-open';

export function DeleteAccountSection(): ReactNode {
  const t = useT('accountClosure');
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback((): void => {
    setIsOpen(false);
    requestAnimationFrame(() => document.getElementById(OPENER_ID)?.focus());
  }, []);
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="delete-account-title" id="delete-account" className="flex flex-col gap-3 border-destructive/40 p-[22px]">
      <h2 id="delete-account-title" className="text-lg font-bold">{t('title')}</h2>
      <p className="text-sm">{t('lead')}</p>
      <div>
        <Button id={OPENER_ID} variant="quiet-danger" onClick={() => setIsOpen(true)} className="-ml-4">
          <Trash2 aria-hidden="true" className="size-4" />
          {t('open')}
        </Button>
      </div>
      {isOpen ? <DeleteAccountDialog onClose={close} /> : null}
    </Card>
  );
}
