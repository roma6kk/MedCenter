'use client';

import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { sectionDomId, type SectionId } from './encounter-sections';

type ListName = 'diagnoses' | 'observations' | 'serviceRequests' | 'medicationRequests';

export function useRemoveRowFocus(
  name: ListName,
  firstField: string,
  section: SectionId,
  count: number,
  remove: (index: number) => void,
): (index: number) => void {
  const { setFocus } = useFormContext<CompleteEncounterForm>();
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const removed: number | null = pending.current;
    if (removed === null) return;
    pending.current = null;
    const index: number = Math.min(removed, count - 1);
    if (index >= 0) setFocus(`${name}.${index}.${firstField}` as never);
    else document.getElementById(`${sectionDomId(section)}-title`)?.focus();
  }, [count, name, firstField, section, setFocus]);
  return (index: number): void => {
    pending.current = index;
    remove(index);
  };
}
