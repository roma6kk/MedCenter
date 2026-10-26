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

interface NoshowMenuProps {
  readonly appointmentId: string;
  /** Names the patient for assistive technology and in the dialog, so the same «⋯» in every row is distinguishable. */
  readonly patientName?: string;
}

/** Marks the element a row keeps focus on once its actions are gone (the journal puts it on the patient link). */
const ROW_ANCHOR_SELECTOR = '[data-row-anchor]';

/** The anchor of the table row or card that holds `from`: the nearest ancestor that contains one is the row itself. */
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

/**
 * The confirmation (A5, E3): says what the no-show does and that the journal cannot take it back, and the solid red button is
 * the only place where the action is confirmed. The service's refusal is spelled out inside. While the request runs the
 * dialog cannot be dismissed: the no-show would be recorded after the doctor closed it.
 */
function NoshowDialog({ appointmentId, patientName, anchorFrom, onClose }: DialogProps): ReactNode {
  const t = useT('doctor.noshow');
  const tCommon = useT('common');
  // The pressed «⋯» disappears with the refresh (a no-show leaves the booked-only actions): once the answer is in, the focus
  // goes to the patient link of the row. It waits a frame so the dialog's own «return focus to the opener» has run first.
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
      {/* aria-disabled, not disabled: a control that loses the focus to the body would let Tab walk out of the dialog. */}
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

/**
 * «⋯» menu of a booked appointment in the journal with its one destructive item, «Неявка» (API 6.6). It no longer sits next
 * to «Карта пациента» in the same weight (A5): a stray click on the neighbour cannot record a no-show, and recording one
 * takes a menu item and a confirmation that names the consequence.
 */
export function NoshowMenu({ appointmentId, patientName }: NoshowMenuProps): ReactNode {
  const t = useT('doctor.noshow');
  const [isOpen, setIsOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const items: ReadonlyArray<MenuItem> = [{ key: 'noshow', label: t('button'), icon: UserX, destructive: true, onSelect: () => setIsOpen(true) }];
  return (
    <span ref={wrapper} className="inline-flex">
      <DropdownMenu label={patientName === undefined ? t('menu') : t('menuFor', { name: patientName })} items={items} />
      {isOpen ? <NoshowDialog appointmentId={appointmentId} patientName={patientName} anchorFrom={wrapper} onClose={() => setIsOpen(false)} /> : null}
    </span>
  );
}
