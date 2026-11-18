'use client';

import { useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DropdownMenu, type MenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/lib/i18n/use-t';
import { InlineProblem } from './inline-problem';
import { useNoshow } from './use-doctor-mutations';
import { useNow } from './use-now';

interface NoshowMenuProps {
  readonly appointmentId: string;
  readonly patientName?: string;
  readonly start?: string;
}

const NOSHOW_TICK_MS = 30_000;

const ROW_ANCHOR_SELECTOR = '[data-row-anchor]';

function rowAnchorOf(from: HTMLElement | null): HTMLElement | null {
  for (let node: HTMLElement | null = from?.parentElement ?? null; node !== null; node = node.parentElement) {
    const anchor: HTMLElement | null = node.querySelector<HTMLElement>(ROW_ANCHOR_SELECTOR);
    if (anchor !== null) return anchor;
  }
  return null;
}

interface DialogProps extends NoshowMenuProps {
  readonly anchorFrom: RefObject<HTMLElement>;
  readonly onClose: () => void;
}

function NoshowDialog({ appointmentId, patientName, anchorFrom, onClose }: DialogProps): ReactNode {
  const t = useT('doctor.noshow');
  const tCommon = useT('common');
  // The pressed «⋯» disappears with the refresh: after the answer focus goes to the row link, a frame later so the dialog restores its own first.
  const noshow = useNoshow(() => {
    const anchor: HTMLElement | null = rowAnchorOf(anchorFrom.current);
    requestAnimationFrame(() => anchor?.focus());
  });
  const confirm = (): void => {
    if (!noshow.isPending) noshow.mutate(appointmentId, { onSuccess: onClose });
  };
  const footer: ReactNode = (
    <>
      <Button variant="secondary" aria-disabled={noshow.isPending} onClick={() => (noshow.isPending ? undefined : onClose())}>{t('cancel')}</Button>
      {/* aria-disabled, not disabled: losing focus to body would let Tab walk out of the dialog. */}
      <Button variant="destructive" aria-disabled={noshow.isPending} onClick={confirm}>{noshow.isPending ? tCommon('loading') : t('confirm')}</Button>
    </>
  );
  return (
    <Dialog
      title={t('dialogTitle')}
      description={patientName === undefined ? t('dialogBody') : t('dialogBodyFor', { name: patientName })}
      size="sm"
      footer={footer}
      onClose={() => (noshow.isPending ? undefined : onClose())}
    >
      {noshow.isError ? (
        <p className="mt-3">
          <InlineProblem error={noshow.error} overrides={{ CONFLICT: t('notBooked'), ENCOUNTER_STATE_INVALID: t('hasEncounter') }} />
        </p>
      ) : null}
    </Dialog>
  );
}

export function NoshowMenu({ appointmentId, patientName, start }: NoshowMenuProps): ReactNode {
  const t = useT('doctor.noshow');
  const now: number | null = useNow(NOSHOW_TICK_MS, start !== undefined);
  const [isOpen, setIsOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  if (start !== undefined && (now === null || Date.parse(start) > now)) return null;
  const items: ReadonlyArray<MenuItem> = [{ key: 'noshow', label: t('button'), icon: UserX, destructive: true, onSelect: () => setIsOpen(true) }];
  return (
    <span ref={wrapper} className="inline-flex">
      <DropdownMenu label={patientName === undefined ? t('menu') : t('menuFor', { name: patientName })} items={items} />
      {isOpen ? <NoshowDialog appointmentId={appointmentId} patientName={patientName} anchorFrom={wrapper} onClose={() => setIsOpen(false)} /> : null}
    </span>
  );
}
