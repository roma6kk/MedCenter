'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotFoundState, TableSkeleton } from '@/components/feedback/states';
import { isMissingError, QueryFailure } from '@/components/feedback/query-error-state';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useFocusFallback } from '@/components/patient/use-focus-fallback';
import { useT } from '@/lib/i18n/use-t';
import { AppointmentDetails } from './appointment-details';
import { isCancellable, type AppointmentView } from './appointment-types';
import { CancelAppointmentDialog } from './cancel-appointment-dialog';
import { useAppointment } from './use-appointments';

function BackLink(): ReactNode {
  const t = useT('appointments');
  return <Link href="/appointments" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary-soft-foreground hover:underline"><ArrowLeft aria-hidden="true" size={16} />{t('back')}</Link>;
}

interface LoadedProps {
  readonly appointment: AppointmentView;
  readonly onCancel: () => void;
}

function LoadedAppointment({ appointment, onCancel }: LoadedProps): ReactNode {
  const t = useT('appointments');
  return (
    <>
      <AppointmentDetails appointment={appointment} />
      {isCancellable(appointment.status) ? (
        <div className="no-print mt-4">
          <Button variant="danger" size="lg" onClick={onCancel}>{t('cancel')}</Button>
        </div>
      ) : null}
    </>
  );
}

/** The record cannot be shown to this patient: the not-found screen is the whole page (it brings its own heading). */
function MissingAppointment(): ReactNode {
  const t = useT('appointments');
  return <NotFoundState title={t('notFoundTitle')} description={t('notFoundHint')} action={<BackLink />} />;
}

interface BodyProps {
  readonly query: ReturnType<typeof useAppointment>;
  readonly onCancel: () => void;
}

function DetailBody({ query, onCancel }: BodyProps): ReactNode {
  const t = useT('appointments');
  if (query.data !== undefined) return <LoadedAppointment appointment={query.data} onCancel={onCancel} />;
  return <QueryFailure query={query} notFoundText={t('notFoundTitle')} badRequestIsNotFound pending={<TableSkeleton />} />;
}

/** One appointment with its cancel action (FR-005, FR-006); a foreign or unknown id looks exactly like a missing one (BR-006). */
export function AppointmentDetailView({ appointmentId }: { readonly appointmentId: string }): ReactNode {
  const t = useT('appointments');
  const query = useAppointment(appointmentId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeDialog = useCallback(() => setIsDialogOpen(false), []);
  // The cancel button is gone once the status changed: keep the keyboard user at the top of the record.
  useFocusFallback(isDialogOpen, heading);
  useDocumentTitle(t('detailTitle'));
  if (query.data === undefined && isMissingError(query.error, true)) return <MissingAppointment />;
  return (
    <section aria-busy={query.isFetching} className="flex flex-col gap-4">
      <BackLink />
      <h1 ref={heading} tabIndex={-1} className="text-[28px] font-bold tracking-tight focus:outline-none sm:text-[34px]">{t('detailTitle')}</h1>
      <div><DetailBody query={query} onCancel={() => setIsDialogOpen(true)} /></div>
      {isDialogOpen && query.data ? <CancelAppointmentDialog appointment={query.data} onClose={closeDialog} onCancelled={closeDialog} /> : null}
    </section>
  );
}
