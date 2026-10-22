'use client';

import type { ReactNode } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { DEFAULT_WINDOW, type ScheduleFormValues } from './schedule-schema';
import { WEEK_DAYS } from './schedule-types';
import { findOverlappingWindows } from './schedule-windows';
import { CONTROL_CLASS, SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { useFormMessage } from '../shared/use-form-message';

interface WindowsEditorProps {
  readonly form: UseFormReturn<ScheduleFormValues>;
  /** The server answered 409 `SCHEDULE_OVERLAP`: it does not say which window, so all of them are marked. */
  readonly serverOverlap: boolean;
}

interface WindowRowProps extends WindowsEditorProps {
  readonly index: number;
  readonly isOverlapping: boolean;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
}

function rowClass(isMarked: boolean): string {
  const border: string = isMarked ? 'border-[var(--destructive)]' : 'border-[var(--border)]';
  return `grid gap-2 rounded-control border ${border} p-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center`;
}

function WindowRow({ form, index, isOverlapping, serverOverlap, onRemove, canRemove }: WindowRowProps): ReactNode {
  const t = useT('admin.schedules');
  const resolve = useFormMessage();
  const { register, formState } = form;
  const rowError: string | undefined = resolve(formState.errors.windows?.[index]?.endTime?.message);
  const isMarked: boolean = isOverlapping || serverOverlap || rowError !== undefined;
  const note: string | undefined = isOverlapping ? t('windows.overlapsAnother') : serverOverlap ? t('windows.overlapsSchedule') : rowError;
  const noteId = `schedule-window-${index}-note`;
  const describedBy: string | undefined = note === undefined ? undefined : noteId;
  return (
    <li className={rowClass(isMarked)} data-testid={`window-row-${index}`} data-overlap={isOverlapping || serverOverlap ? 'true' : 'false'}>
      <select aria-label={t('windows.day', { n: index + 1 })} className={CONTROL_CLASS} {...register(`windows.${index}.dayOfWeek`)}>
        {WEEK_DAYS.map((day) => (
          <option key={day} value={day}>{t(`days.${day}`)}</option>
        ))}
      </select>
      <input type="time" aria-label={t('windows.start', { n: index + 1 })} aria-invalid={isMarked || undefined} aria-describedby={describedBy} className={CONTROL_CLASS} {...register(`windows.${index}.startTime`)} />
      <input type="time" aria-label={t('windows.end', { n: index + 1 })} aria-invalid={isMarked || undefined} aria-describedby={describedBy} className={CONTROL_CLASS} {...register(`windows.${index}.endTime`)} />
      <button type="button" onClick={onRemove} disabled={!canRemove} aria-label={t('windows.remove', { n: index + 1 })} className={`${SECONDARY_BUTTON_CLASS} min-w-[44px]`}>
        ×
      </button>
      {note === undefined ? null : <p id={noteId} className="text-xs text-[var(--destructive)] sm:col-span-4">{note}</p>}
    </li>
  );
}

/**
 * The weekly windows of a schedule: one row per window (weekday + from + to). A window that crosses another one of the same
 * weekday is marked as soon as it is typed (BR-007 preview); the server's `SCHEDULE_OVERLAP` marks them all.
 */
export function ScheduleWindowsEditor({ form, serverOverlap }: WindowsEditorProps): ReactNode {
  const t = useT('admin.schedules');
  const resolve = useFormMessage();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'windows' });
  const overlapping = findOverlappingWindows(form.watch('windows'));
  const groupError: string | undefined = resolve(form.formState.errors.windows?.message ?? form.formState.errors.windows?.root?.message);
  return (
    <fieldset className="grid gap-2">
      <legend className="form-label">{t('windows.legend')}</legend>
      <ul className="grid gap-2">
        {fields.map((field, index) => (
          <WindowRow key={field.id} form={form} index={index} serverOverlap={serverOverlap} isOverlapping={overlapping.has(index)} canRemove={fields.length > 1} onRemove={() => remove(index)} />
        ))}
      </ul>
      {groupError !== undefined ? <p role="alert" className="text-xs text-[var(--destructive)]">{groupError}</p> : null}
      <div>
        <button type="button" onClick={() => append({ ...DEFAULT_WINDOW })} className={SECONDARY_BUTTON_CLASS}>
          {t('windows.add')}
        </button>
      </div>
    </fieldset>
  );
}
