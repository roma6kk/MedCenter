'use client';

import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { formatDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { defaultGenerationRange, validateGenerationRange, type GenerationRange, type GenerationRangeError } from './generation-range';
import type { AdminSchedule, GenerateSlotsResult } from './schedule-types';
import { AdminProblem } from '../shared/admin-problem';
import { CONTROL_CLASS, SECONDARY_BUTTON_CLASS } from '../shared/admin-styles';
import { focusField } from '../shared/focus-field';
import { controlProps, Field } from '../shared/form-field';
import { Modal } from '../shared/modal';
import { SubmitButton } from '../shared/submit-button';
import { useIdempotencyKey } from '../shared/use-idempotency-key';
import { useGenerateSlots, type GenerateSlotsVars } from './use-admin-schedules';

interface SlotGenerationDialogProps {
  readonly schedule: AdminSchedule;
  /** Who the schedule belongs to, shown under the title (doctor · room). */
  readonly scheduleLabel?: string;
  readonly onClose: () => void;
}

function GenerationResult({ result }: { readonly result: GenerateSlotsResult }): ReactNode {
  const t = useT('admin.slots');
  return (
    <p role="status" data-testid="generation-result" className="mt-3 rounded-control border border-[var(--success)] p-3 text-sm">
      {t('generate.result', { generated: result.generated, skipped: result.skipped })}
    </p>
  );
}

interface GenerationForm {
  readonly range: GenerationRange;
  readonly rangeError: GenerationRangeError | null;
  readonly generate: UseMutationResult<GenerateSlotsResult, Error, GenerateSlotsVars>;
  /** A period edit: the result and the failure of the previous period are not the answer for the new one. */
  readonly change: (next: GenerationRange) => void;
  readonly handleSubmit: (event: FormEvent) => void;
}

function useGenerationForm(schedule: AdminSchedule): GenerationForm {
  const [range, setRange] = useState<GenerationRange>(() => defaultGenerationRange(schedule));
  const [rangeError, setRangeError] = useState<GenerationRangeError | null>(null);
  const generate = useGenerateSlots(schedule.id);
  const intent = useIdempotencyKey(`${range.from}|${range.to}`);
  const change = (next: GenerationRange): void => {
    setRange(next);
    setRangeError(null);
    generate.reset();
  };
  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const error = validateGenerationRange(range, schedule);
    setRangeError(error);
    if (error !== null) {
      focusField('generate-from');
      return;
    }
    generate.mutate({ ...range, idempotencyKey: intent.current() }, { onSuccess: intent.rotate });
  };
  return { range, rangeError, generate, change, handleSubmit };
}

/**
 * Slot generation of one schedule (FR-020, API 5.2.5): a `from`…`to` period inside the planning horizon, sent with the
 * `Idempotency-Key` of the intent — a retry of the same period reuses it, a new period or a finished run gets a new key.
 */
export function SlotGenerationDialog({ schedule, scheduleLabel, onClose }: SlotGenerationDialogProps): ReactNode {
  const t = useT('admin.slots');
  const { range, rangeError, generate, change, handleSubmit } = useGenerationForm(schedule);
  const error: string | undefined = rangeError === null ? undefined : t(`generate.errors.${rangeError}`);
  const horizon: string = schedule.horizonFrom && schedule.horizonTo ? t('generate.horizon', { from: formatDateKey(schedule.horizonFrom, 'numeric'), to: formatDateKey(schedule.horizonTo, 'numeric') }) : '';
  return (
    <Modal title={t('generate.title')} onClose={onClose} size="sm">
      {scheduleLabel ? <p className="text-sm text-[var(--muted-foreground)]">{scheduleLabel}</p> : null}
      <form onSubmit={handleSubmit} noValidate className="mt-3 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="generate-from" label={t('generate.from')} error={error} hint={horizon} required>
            <input {...controlProps('generate-from', error, horizon)} type="date" value={range.from} onChange={(event) => change({ ...range, from: event.target.value })} className={CONTROL_CLASS} />
          </Field>
          <Field id="generate-to" label={t('generate.to')} required>
            <input id="generate-to" type="date" value={range.to} aria-invalid={error ? true : undefined} aria-describedby={error ? 'generate-from-error' : undefined} onChange={(event) => change({ ...range, to: event.target.value })} className={CONTROL_CLASS} />
          </Field>
        </div>
        {generate.isError ? <AdminProblem error={generate.error} /> : null}
        {generate.data ? <GenerationResult result={generate.data} /> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>{t('generate.close')}</button>
          <SubmitButton label={t('generate.run')} pendingLabel={t('generate.running')} isPending={generate.isPending} error={generate.error} />
        </div>
      </form>
    </Modal>
  );
}
