'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotFoundState } from '@/components/feedback/states';
import { ContentSkeleton } from '@/components/feedback/content-skeleton';
import { isMissingError, QueryFailure } from '@/components/feedback/query-error-state';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useFocusFallback } from '@/components/patient/use-focus-fallback';
import { useT } from '@/lib/i18n/use-t';
import { AppointmentDetails } from './appointment-details';
import { isCancellableByPatient, type AppointmentView } from './appointment-types';
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
    <div className="animate-fade-in">
      <AppointmentDetails appointment={appointment} />
      {isCancellableByPatient(appointment) ? (
        <div className="no-print mt-4">
          <Button variant="quiet-danger" size="lg" onClick={onCancel}>
            <CircleX aria-hidden="true" className="size-5" />
            {t('cancel')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

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
  return <QueryFailure query={query} notFoundText={t('notFoundTitle')} badRequestIsNotFound pending={<ContentSkeleton shape="detail" />} />;
}

export function AppointmentDetailView({ appointmentId }: { readonly appointmentId: string }): ReactNode {
  const t = useT('appointments');
  const query = useAppointment(appointmentId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeDialog = useCallback(() => setIsDialogOpen(false), []);
  useFocusFallback(isDialogOpen, heading);
  const format = useClinicFormat();
  const title: string = query.data === undefined ? t('detailTitle') : t('detailHeading', { when: format.dayTime(query.data.start) });
  useDocumentTitle(title);
  if (query.data === undefined && isMissingError(query.error, true)) return <MissingAppointment />;
  return (
    <section aria-busy={query.isFetching} className="flex flex-col gap-4">
      <BackLink />
      <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold tracking-tight focus:outline-none">{title}</h1>
      <div><DetailBody query={query} onCancel={() => setIsDialogOpen(true)} /></div>
      {isDialogOpen && query.data ? <CancelAppointmentDialog appointment={query.data} onClose={closeDialog} onCancelled={closeDialog} /> : null}
    </section>
  );
}
