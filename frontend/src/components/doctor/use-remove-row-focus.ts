'use client';

import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import type { CompleteEncounterForm } from '@/lib/contracts';
import { sectionDomId, type SectionId } from './encounter-sections';

type ListName = 'diagnoses' | 'observations' | 'serviceRequests' | 'medicationRequests';

/**
 * Removing a row destroys the button that was pressed, so the focus would fall to `<body>` and a keyboard or screen-reader
 * user would lose their place. This wraps `remove(index)`: once the list has re-rendered, the focus goes to the first field of
 * the row that now sits at that index, else of the previous row, else to the heading of the section (the list is empty).
 */
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
