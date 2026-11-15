'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import { normalizeDoctorName } from '@/lib/doctor-name';

const PRINTING_CLASS = 'printing-visit';

interface PrintCoding {
  readonly code: string;
  readonly text: string;
}

export interface VisitPrintData {
  readonly patientName: string;
  readonly birthDate?: string | undefined;
  readonly visitDate: string;
  readonly enteredAt: string;
  readonly doctorName?: string | undefined;
  readonly service?: string | undefined;
  readonly diagnoses: ReadonlyArray<PrintCoding>;
  readonly summary?: string | undefined;
  readonly recommendations?: string | undefined;
  readonly orders: ReadonlyArray<PrintCoding>;
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <div className="visit-print-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Codings({ items, empty }: { readonly items: ReadonlyArray<PrintCoding>; readonly empty: string }): ReactNode {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item.code}-${index}`}>
          <code>{item.code}</code>
          {item.text ? ` ${item.text}` : ''}
        </li>
      ))}
    </ul>
  );
}

export function VisitPrintSheet({ data }: { readonly data: VisitPrintData }): ReactNode {
  const t = useT('visitPrint');
  const format = useClinicFormat();
  const doctor = normalizeDoctorName(data.doctorName) || t('unknownDoctor');
  return (
    <div className="visit-print-sheet" data-testid="visit-print-sheet">
      <p className="visit-print-clinic">{t('clinic')}</p>
      <h1>{t('title')}</h1>
      <dl>
        <Row label={t('patient')}>{data.patientName}</Row>
        {data.birthDate ? <Row label={t('birthDate')}>{format.dateOnly(data.birthDate)}</Row> : null}
        <Row label={t('visitDate')}>{format.dateTime(data.visitDate)}</Row>
        <Row label={t('doctor')}>{doctor}</Row>
        {data.service ? <Row label={t('service')}>{data.service}</Row> : null}
        <Row label={t('diagnoses')}><Codings items={data.diagnoses} empty={t('none')} /></Row>
        <Row label={t('conclusion')}>{data.summary ? <span className="visit-print-text">{data.summary}</span> : t('none')}</Row>
        <Row label={t('recommendations')}>{data.recommendations ? <span className="visit-print-text">{data.recommendations}</span> : t('none')}</Row>
        <Row label={t('prescriptions')}><Codings items={data.orders} empty={t('none')} /></Row>
      </dl>
      <p className="visit-print-footer">{t('footer', { doctor, datetime: format.dateTime(data.enteredAt) })}</p>
    </div>
  );
}

// Mounted only while printing: the sheet goes next to the app root, and the print stylesheet hides everything else.
export function VisitPrintPortal({ data, onDone }: { readonly data: VisitPrintData; readonly onDone: () => void }): ReactNode {
  useEffect(() => {
    document.body.classList.add(PRINTING_CLASS);
    const finish = (): void => {
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove(PRINTING_CLASS);
      onDone();
    };
    window.addEventListener('afterprint', finish);
    window.print();
    return () => {
      window.removeEventListener('afterprint', finish);
      document.body.classList.remove(PRINTING_CLASS);
    };
  }, [onDone]);
  return createPortal(<VisitPrintSheet data={data} />, document.body);
}
