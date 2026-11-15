'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { VisitPrintPortal, type VisitPrintData } from '@/components/print/visit-print';
import type { HistoryEntry, Prescription } from '../patient-types';
import type { PrescriptionsState } from './visit-row';
import { usePatientProfile } from '../use-patient-queries';
import { diagnosesOf } from './history-model';

function orderOf(prescription: Prescription): { readonly code: string; readonly text: string } {
  if (prescription.kind === 'medication') return { code: prescription.atcCode, text: [prescription.atcDisplay, prescription.dosageText].filter(Boolean).join(' — ') };
  return { code: prescription.code, text: prescription.display ?? '' };
}

interface PatientVisitPrintProps {
  readonly entry: HistoryEntry;
  readonly prescriptions: ReadonlyArray<Prescription>;
  readonly prescriptionsState: PrescriptionsState;
  readonly onDone: () => void;
}

export function PatientVisitPrint({ entry, prescriptions, prescriptionsState, onDone }: PatientVisitPrintProps): ReactNode {
  const profile = usePatientProfile();
  useEffect(() => {
    if (profile.isError) onDone();
  }, [profile.isError, onDone]);
  if (profile.data === undefined || prescriptionsState === 'loading') return null;
  const data: VisitPrintData = {
    patientName: profile.data.fullName,
    birthDate: profile.data.birthDate,
    visitDate: entry.date,
    enteredAt: entry.endDate ?? entry.date,
    doctorName: entry.doctorName,
    service: entry.serviceType?.display,
    diagnoses: diagnosesOf(entry).map((diagnosis) => ({ code: diagnosis.code, text: diagnosis.display })),
    summary: entry.summary,
    recommendations: entry.recommendations,
    orders: prescriptions.map(orderOf),
    ordersUnavailable: prescriptionsState !== 'ok',
  };
  return <VisitPrintPortal data={data} onDone={onDone} />;
}
