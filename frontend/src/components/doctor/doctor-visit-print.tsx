'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { VisitPrintPortal, type VisitPrintData } from '@/components/print/visit-print';
import type { HistoryItem, Prescription } from './doctor-types';
import { orderName } from './patient-summary-model';
import { usePatient, useVisitPrescriptions } from './use-doctor-queries';

function orderOf(item: Prescription): { readonly code: string; readonly text: string } {
  return item.kind === 'medication' ? { code: item.atcCode, text: `${orderName(item)} — ${item.dosageText}` } : { code: item.code, text: orderName(item) };
}

interface DoctorVisitPrintProps {
  readonly item: HistoryItem;
  readonly patientId: string;
  readonly onDone: () => void;
}

export function DoctorVisitPrint({ item, patientId, onDone }: DoctorVisitPrintProps): ReactNode {
  const patient = usePatient(patientId);
  const orders = useVisitPrescriptions(patientId, item.id);
  const failed = patient.isError || orders.isError;
  useEffect(() => {
    if (failed) onDone();
  }, [failed, onDone]);
  if (patient.data === undefined || orders.data === undefined) return null;
  const data: VisitPrintData = {
    patientName: patient.data.fullName,
    birthDate: patient.data.birthDate,
    visitDate: item.date,
    enteredAt: item.endDate ?? item.date,
    doctorName: item.doctorName,
    service: item.serviceType?.display,
    diagnoses: item.diagnoses.map((diagnosis) => ({ code: diagnosis.code, text: diagnosis.display })),
    summary: item.summary,
    recommendations: item.recommendations,
    orders: orders.data.items.map(orderOf),
  };
  return <VisitPrintPortal data={data} onDone={onDone} />;
}
