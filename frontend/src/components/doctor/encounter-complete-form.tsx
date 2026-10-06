'use client';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { completeEncounterSchema, type CompleteEncounterForm } from '@/lib/contracts';
import { apiFetch, ApiError, idempotencyKey } from '@/lib/api/api-fetch';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Icd10Combobox } from '@/components/doctor/icd10-combobox';

const UCUM_UNITS: ReadonlyArray<string> = ['Cel', 'mg', 'g', 'mL', 'mmol/L', 'mg/dL'];

const EMPTY_DIAGNOSIS = { code: '', display: '' };
const EMPTY_SERVICE = { code: '', display: '' };
const EMPTY_MEDICATION = { atcCode: '', dosageText: '', ucumUnit: UCUM_UNITS[0] ?? 'mg' };

const INPUT_CLASS = 'mt-1 w-full rounded-[6px] border border-[var(--input)] p-2';

interface EditorProps {
  readonly control: Control<CompleteEncounterForm>;
  readonly register: UseFormRegister<CompleteEncounterForm>;
  readonly errors: FieldErrors<CompleteEncounterForm>;
}

interface RowErrors {
  readonly code?: { readonly message?: string };
  readonly display?: { readonly message?: string };
  readonly atcCode?: { readonly message?: string };
  readonly dosageText?: { readonly message?: string };
  readonly ucumUnit?: { readonly message?: string };
}

/** Reads a Zod/RHF `message` off a field error union without leaking `any`. */
function fieldMessage(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message: unknown = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return undefined;
}

function rowErrors(rows: unknown): ReadonlyArray<RowErrors | undefined> | undefined {
  return rows as ReadonlyArray<RowErrors | undefined> | undefined;
}

function RemoveButton({ onClick, label }: { readonly onClick: () => void; readonly label: string }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} className="mt-2 text-sm underline">
      {label}
    </button>
  );
}

function DiagnosesEditor({ control, register, errors }: EditorProps): React.JSX.Element {
  const { fields, append, remove } = useFieldArray({ control, name: 'diagnoses' });
  const rows = rowErrors(errors.diagnoses);
  return (
    <fieldset className="rounded-[6px] border border-[var(--border)] p-4">
      <legend className="px-1 font-semibold">Заключение и диагнозы</legend>
      <label htmlFor="summary" className="form-label block">Заключение</label>
      <textarea id="summary" {...register('summary')} className={INPUT_CLASS} />
      {errors.summary ? <p role="alert" className="text-sm text-[var(--destructive)]">{errors.summary.message}</p> : null}
      <p className="mt-3 text-sm font-medium">Диагнозы (МКБ-10) — минимум один</p>
      {fieldMessage(errors.diagnoses) ? (
        <p role="alert" data-testid="diagnoses-error" className="text-sm text-[var(--destructive)]">{fieldMessage(errors.diagnoses)}</p>
      ) : null}
      {fields.map((field, index) => (
        <div key={field.id} className="mt-2 rounded-[6px] border border-[var(--border)] p-3">
          <Controller
            control={control}
            name={`diagnoses.${index}.code`}
            render={({ field: codeField }) => (
              <Icd10Combobox id={`icd10-${index}`} value={codeField.value} onChange={codeField.onChange} />
            )}
          />
          {fieldMessage(rows?.[index]?.code) ? <p role="alert" className="text-sm text-[var(--destructive)]">{fieldMessage(rows?.[index]?.code)}</p> : null}
          <label htmlFor={`diagnosis-display-${index}`} className="form-label mt-2 block">Название диагноза</label>
          <input id={`diagnosis-display-${index}`} {...register(`diagnoses.${index}.display`)} className={INPUT_CLASS} />
          {fieldMessage(rows?.[index]?.display) ? <p role="alert" className="text-sm text-[var(--destructive)]">{fieldMessage(rows?.[index]?.display)}</p> : null}
          {fields.length > 1 ? <RemoveButton onClick={() => remove(index)} label="Удалить диагноз" /> : null}
        </div>
      ))}
      <button type="button" onClick={() => append(EMPTY_DIAGNOSIS)} className="mt-3 rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">
        Добавить диагноз
      </button>
    </fieldset>
  );
}

function ServiceRequestsEditor({ control, register, errors }: EditorProps): React.JSX.Element {
  const { fields, append, remove } = useFieldArray({ control, name: 'serviceRequests' });
  const rows = rowErrors(errors.serviceRequests);
  return (
    <fieldset className="mt-4 rounded-[6px] border border-[var(--border)] p-4">
      <legend className="px-1 font-semibold">Назначения услуг</legend>
      {fields.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">Услуги не назначены.</p> : null}
      {fields.map((field, index) => (
        <div key={field.id} className="mt-2 rounded-[6px] border border-[var(--border)] p-3">
          <label htmlFor={`service-code-${index}`} className="form-label block">Код услуги</label>
          <input id={`service-code-${index}`} {...register(`serviceRequests.${index}.code`)} className={INPUT_CLASS} />
          {fieldMessage(rows?.[index]?.code) ? <p role="alert" className="text-sm text-[var(--destructive)]">{fieldMessage(rows?.[index]?.code)}</p> : null}
          <label htmlFor={`service-display-${index}`} className="form-label mt-2 block">Название услуги</label>
          <input id={`service-display-${index}`} {...register(`serviceRequests.${index}.display`)} className={INPUT_CLASS} />
          {fieldMessage(rows?.[index]?.display) ? <p role="alert" className="text-sm text-[var(--destructive)]">{fieldMessage(rows?.[index]?.display)}</p> : null}
          <RemoveButton onClick={() => remove(index)} label="Удалить услугу" />
        </div>
      ))}
      <button type="button" onClick={() => append(EMPTY_SERVICE)} className="mt-3 rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">
        Добавить услугу
      </button>
    </fieldset>
  );
}

function MedicationRequestsEditor({ control, register, errors }: EditorProps): React.JSX.Element {
  const { fields, append, remove } = useFieldArray({ control, name: 'medicationRequests' });
  const rows = rowErrors(errors.medicationRequests);
  return (
    <fieldset className="mt-4 rounded-[6px] border border-[var(--border)] p-4">
      <legend className="px-1 font-semibold">Назначения лекарств</legend>
      {fields.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">Лекарства не назначены.</p> : null}
      {fields.map((field, index) => (
        <div key={field.id} className="mt-2 rounded-[6px] border border-[var(--border)] p-3">
          <label htmlFor={`medication-atc-${index}`} className="form-label block">Код АТХ</label>
          <input id={`medication-atc-${index}`} {...register(`medicationRequests.${index}.atcCode`)} className={`mono ${INPUT_CLASS}`} placeholder="N02BE01" />
          {fieldMessage(rows?.[index]?.atcCode) ? <p role="alert" className="text-sm text-[var(--destructive)]">{fieldMessage(rows?.[index]?.atcCode)}</p> : null}
          <label htmlFor={`medication-dosage-${index}`} className="form-label mt-2 block">Дозировка</label>
          <input id={`medication-dosage-${index}`} {...register(`medicationRequests.${index}.dosageText`)} className={INPUT_CLASS} />
          {fieldMessage(rows?.[index]?.dosageText) ? <p role="alert" className="text-sm text-[var(--destructive)]">{fieldMessage(rows?.[index]?.dosageText)}</p> : null}
          <label htmlFor={`medication-ucum-${index}`} className="form-label mt-2 block">Единица измерения (UCUM — только выбор)</label>
          <select id={`medication-ucum-${index}`} {...register(`medicationRequests.${index}.ucumUnit`)} className={INPUT_CLASS}>
            {UCUM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          {fieldMessage(rows?.[index]?.ucumUnit) ? <p role="alert" className="text-sm text-[var(--destructive)]">{fieldMessage(rows?.[index]?.ucumUnit)}</p> : null}
          <RemoveButton onClick={() => remove(index)} label="Удалить лекарство" />
        </div>
      ))}
      <button type="button" onClick={() => append(EMPTY_MEDICATION)} className="mt-3 rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">
        Добавить лекарство
      </button>
    </fieldset>
  );
}

export function EncounterCompleteForm({ encounterId, readOnly }: { readonly encounterId: string; readonly readOnly?: boolean }): React.JSX.Element {
  const [readonlyBanner, setReadonlyBanner] = useState(readOnly ?? false);
  const queryClient = useQueryClient();
  const { control, register, handleSubmit, formState: { errors } } = useForm<CompleteEncounterForm>({
    resolver: zodResolver(completeEncounterSchema),
    defaultValues: { summary: '', diagnoses: [EMPTY_DIAGNOSIS], recommendations: '', serviceRequests: [], medicationRequests: [] },
  });
  const complete = useMutation({
    mutationFn: (values: CompleteEncounterForm) =>
      apiFetch(`/api/v1/encounters/${encounterId}/complete`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey() }, body: JSON.stringify(values) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] });
      void queryClient.invalidateQueries({ queryKey: ['patientHistory'] });
      void queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    },
    onError: (error) => { if (error instanceof ApiError && error.problem.errorCode === 'ENCOUNTER_STATE_INVALID') setReadonlyBanner(true); },
  });
  if (readonlyBanner) return <p role="status" data-testid="encounter-readonly" className="rounded-[6px] border border-[var(--border)] p-4">Приём завершён. Форма доступна только для чтения.</p>;
  const problem = complete.error instanceof ApiError ? complete.error.problem : undefined;
  return (
    <form onSubmit={handleSubmit((values) => complete.mutate(values))} aria-label="Оформление приёма">
      <DiagnosesEditor control={control} register={register} errors={errors} />
      <fieldset className="mt-4 rounded-[6px] border border-[var(--border)] p-4">
        <legend className="px-1 font-semibold">Наблюдения</legend>
        <p className="text-sm text-[var(--muted-foreground)]">Температура, давление и другие показатели вносятся свободным текстом заключения.</p>
      </fieldset>
      <ServiceRequestsEditor control={control} register={register} errors={errors} />
      <MedicationRequestsEditor control={control} register={register} errors={errors} />
      <fieldset className="mt-4 rounded-[6px] border border-[var(--border)] p-4">
        <legend className="px-1 font-semibold">Рекомендации</legend>
        <label htmlFor="recommendations" className="form-label block">Рекомендации</label>
        <textarea id="recommendations" {...register('recommendations')} className={INPUT_CLASS} />
      </fieldset>
      {complete.isError ? (
        <div className="mt-3">
          <ProblemBanner title="Не удалось завершить приём" detail={problem?.detail} errorCode={problem?.errorCode ?? 'INTERNAL'} />
        </div>
      ) : null}
      <button type="submit" disabled={complete.isPending} className="mt-4 rounded-[6px] bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Завершить приём</button>
    </form>
  );
}
