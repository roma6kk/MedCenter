'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useT } from '@/lib/i18n/use-t';
import { ChangePasswordDialog } from './change-password-dialog';

const OPENER_ID = 'change-password-open';

export function ChangePasswordSection(): ReactNode {
  const t = useT('passwordChange');
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback((): void => {
    setIsOpen(false);
    requestAnimationFrame(() => document.getElementById(OPENER_ID)?.focus());
  }, []);
  return (
    <Card as="section" radius="panel" padding="none" aria-labelledby="change-password-title" className="flex flex-col gap-3 p-[22px]">
      <h2 id="change-password-title" className="text-lg font-bold">{t('title')}</h2>
      <p className="text-sm">{t('sectionLead')}</p>
      <div>
        <Button id={OPENER_ID} variant="secondary" onClick={() => setIsOpen(true)}>
          <KeyRound aria-hidden="true" className="size-4" />
          {t('open')}
        </Button>
      </div>
      {isOpen ? <ChangePasswordDialog onClose={close} /> : null}
    </Card>
  );
}
