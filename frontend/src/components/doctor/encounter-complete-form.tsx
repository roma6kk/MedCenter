'use client';
import { useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  OBSERVATION_CODE_SYSTEM_DEFAULT,
  SERVICE_CODE_SYSTEM_DEFAULT,
  completeEncounterSchema,
  type CompleteEncounterForm,
} from '@/lib/contracts';
import { apiFetch, ApiError, idempotencyKey } from '@/lib/api/api-fetch';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Icd10Combobox } from '@/components/doctor/icd10-combobox';
import { AtcCodeField } from '@/components/doctor/atc-code-field';
import { UcumUnitSelect } from '@/components/doctor/ucum-unit-select';

const EMPTY_DIAGNOSIS = { code: '', display: '' };
const EMPTY_OBSERVATION = { codeSystem: OBSERVATION_CODE_SYSTEM_DEFAULT, code: '', value: NaN, unit: 'Cel' };
const EMPTY_SERVICE = { codeSystem: SERVICE_CODE_SYSTEM_DEFAULT, code: '' };
const EMPTY_MEDICATION = { atcCode: '', dosageText: '' };

const INPUT_CLASS = 'mt-1 w-full rounded-[6px] border border-[var(--input)] p-2';

const VERIFICATION_STATUSES: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: 'Не указан' },
  { value: 'working', label: 'Рабочий' },
  { value: 'provisional', label: 'Предварительный' },
  { value: 'confirmed', label: 'Подтверждённый' },
];

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
  readonly codeSystem?: { readonly message?: string };
  readonly value?: { readonly message?: string };
  readonly unit?: { readonly message?: string };
  readonly note?: { readonly message?: string };
  readonly verificationStatus?: { readonly message?: string };
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

function firstRowWithError(rows: unknown): number | null {
  if (!Array.isArray(rows)) return null;
  const index = rows.findIndex((row) => typeof row === 'object' && row !== null && Object.keys(row).length > 0);
  return index === -1 ? null : index;
}

function RemoveButton({ onClick, label, ariaLabel }: { readonly onClick: () => void; readonly label: string; readonly ariaLabel: string }): React.JSX.Element {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className="mt-2 text-sm underline">
      {label}
    </button>
  );
}

function TextField({ id, label, error, children }: { readonly id: string; readonly label: string; readonly error?: string; readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="form-label block">{label}</label>
      {children}
      {error ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}
    </div>
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
          <div className="mt-2">
            <TextField id={`diagnosis-display-${index}`} label={`Название диагноза ${index + 1}`} error={fieldMessage(rows?.[index]?.display)}>
              <input
                id={`diagnosis-display-${index}`}
                {...register(`diagnoses.${index}.display`)}
                className={INPUT_CLASS}
                spellCheck={false}
                autoComplete="off"
              />
            </TextField>
          </div>
          <div className="mt-2">
            <TextField id={`diagnosis-status-${index}`} label={`Статус подтверждения ${index + 1}`} error={fieldMessage(rows?.[index]?.verificationStatus)}>
              <select
                id={`diagnosis-status-${index}`}
                {...register(`diagnoses.${index}.verificationStatus`)}
                className={INPUT_CLASS}
              >
                {VERIFICATION_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </TextField>
          </div>
          {fields.length > 1 ? <RemoveButton onClick={() => remove(index)} label="Удалить диагноз" ariaLabel={`Удалить диагноз ${index + 1}`} /> : null}
        </div>
      ))}
      <button type="button" onClick={() => append(EMPTY_DIAGNOSIS)} className="mt-3 rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">
        Добавить диагноз
      </button>
    </fieldset>
  );
}

function ObservationsEditor({ control, register, errors }: EditorProps): React.JSX.Element {
  const { fields, append, remove } = useFieldArray({ control, name: 'observations' });
  const rows = rowErrors(errors.observations);
  return (
    <fieldset className="mt-4 rounded-[6px] border border-[var(--border)] p-4">
      <legend className="px-1 font-semibold">Наблюдения (витальные показатели)</legend>
      {fields.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">Наблюдения не добавлены.</p> : null}
      {fields.map((field, index) => (
        <div key={field.id} className="mt-2 rounded-[6px] border border-[var(--border)] p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <TextField id={`observation-system-${index}`} label={`Система кодов ${index + 1}`} error={fieldMessage(rows?.[index]?.codeSystem)}>
              <input
                id={`observation-system-${index}`}
                {...register(`observations.${index}.codeSystem`)}
                className={`mono ${INPUT_CLASS}`}
                spellCheck={false}
                autoComplete="off"
              />
            </TextField>
            <TextField id={`observation-code-${index}`} label={`Код показателя ${index + 1}`} error={fieldMessage(rows?.[index]?.code)}>
              <input
                id={`observation-code-${index}`}
                {...register(`observations.${index}.code`)}
                className={`mono ${INPUT_CLASS}`}
                placeholder="8480-6…"
                spellCheck={false}
                autoComplete="off"
              />
            </TextField>
            <TextField id={`observation-value-${index}`} label={`Значение ${index + 1}`} error={fieldMessage(rows?.[index]?.value)}>
              <input
                id={`observation-value-${index}`}
                type="number"
                step="any"
                {...register(`observations.${index}.value`, { valueAsNumber: true })}
                className={`mono ${INPUT_CLASS}`}
                inputMode="decimal"
              />
            </TextField>
            <TextField id={`observation-unit-${index}`} label={`Единица UCUM ${index + 1} — только выбор`} error={fieldMessage(rows?.[index]?.unit)}>
              <UcumUnitSelect id={`observation-unit-${index}`} {...register(`observations.${index}.unit`)} />
            </TextField>
          </div>
          <RemoveButton onClick={() => remove(index)} label="Удалить наблюдение" ariaLabel={`Удалить наблюдение ${index + 1}`} />
        </div>
      ))}
      <button type="button" onClick={() => append(EMPTY_OBSERVATION)} className="mt-3 rounded-[6px] border border-[var(--border)] px-3 py-1 text-sm">
        Добавить наблюдение
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
          <TextField id={`service-system-${index}`} label={`Система кодов ${index + 1}`} error={fieldMessage(rows?.[index]?.codeSystem)}>
            <input
              id={`service-system-${index}`}
              {...register(`serviceRequests.${index}.codeSystem`)}
              className={`mono ${INPUT_CLASS}`}
              spellCheck={false}
              autoComplete="off"
            />
          </TextField>
          <div className="mt-2">
            <TextField id={`service-code-${index}`} label={`Код услуги ${index + 1}`} error={fieldMessage(rows?.[index]?.code)}>
              <input
                id={`service-code-${index}`}
                {...register(`serviceRequests.${index}.code`)}
                className={`mono ${INPUT_CLASS}`}
                spellCheck={false}
                autoComplete="off"
              />
            </TextField>
          </div>
          <div className="mt-2">
            <TextField id={`service-note-${index}`} label={`Примечание ${index + 1}`} error={fieldMessage(rows?.[index]?.note)}>
              <input id={`service-note-${index}`} {...register(`serviceRequests.${index}.note`)} className={INPUT_CLASS} />
            </TextField>
          </div>
          <RemoveButton onClick={() => remove(index)} label="Удалить услугу" ariaLabel={`Удалить услугу ${index + 1}`} />
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
          <TextField id={`medication-atc-${index}`} label={`Код АТХ ${index + 1}`} error={fieldMessage(rows?.[index]?.atcCode)}>
            <AtcCodeField
              id={`medication-atc-${index}`}
              {...register(`medicationRequests.${index}.atcCode`)}
              placeholder="N02BE01…"
            />
          </TextField>
          <div className="mt-2">
            <TextField id={`medication-dosage-${index}`} label={`Дозировка ${index + 1}`} error={fieldMessage(rows?.[index]?.dosageText)}>
              <input id={`medication-dosage-${index}`} {...register(`medicationRequests.${index}.dosageText`)} className={INPUT_CLASS} />
            </TextField>
          </div>
          <div className="mt-2">
            <TextField id={`medication-note-${index}`} label={`Примечание ${index + 1}`} error={fieldMessage(rows?.[index]?.note)}>
              <input id={`medication-note-${index}`} {...register(`medicationRequests.${index}.note`)} className={INPUT_CLASS} />
            </TextField>
          </div>
          <RemoveButton onClick={() => remove(index)} label="Удалить лекарство" ariaLabel={`Удалить лекарство ${index + 1}`} />
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
  const formRef = useRef<HTMLFormElement>(null);
  const { control, register, handleSubmit, setFocus, formState: { errors } } = useForm<CompleteEncounterForm>({
    resolver: zodResolver(completeEncounterSchema),
    defaultValues: { summary: '', diagnoses: [EMPTY_DIAGNOSIS], recommendations: '', observations: [], serviceRequests: [], medicationRequests: [] },
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
  const focusFirstError = (formErrors: FieldErrors<CompleteEncounterForm>): void => {
    if (formErrors.summary) { setFocus('summary'); return; }
    const diagnosisIndex = firstRowWithError(formErrors.diagnoses);
    if (diagnosisIndex !== null) { setFocus(`diagnoses.${diagnosisIndex}.code`); return; }
    const observationIndex = firstRowWithError(formErrors.observations);
    if (observationIndex !== null) { setFocus(`observations.${observationIndex}.code`); return; }
    const serviceIndex = firstRowWithError(formErrors.serviceRequests);
    if (serviceIndex !== null) { setFocus(`serviceRequests.${serviceIndex}.code`); return; }
    const medicationIndex = firstRowWithError(formErrors.medicationRequests);
    if (medicationIndex !== null) { setFocus(`medicationRequests.${medicationIndex}.atcCode`); return; }
    if (formErrors.recommendations) { setFocus('recommendations'); return; }
    formRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
  };
  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(
        (values) => complete.mutate(values),
        (formErrors) => focusFirstError(formErrors),
      )}
      aria-label="Оформление приёма"
      noValidate
    >
      <DiagnosesEditor control={control} register={register} errors={errors} />
      <ObservationsEditor control={control} register={register} errors={errors} />
      <ServiceRequestsEditor control={control} register={register} errors={errors} />
      <MedicationRequestsEditor control={control} register={register} errors={errors} />
      <fieldset className="mt-4 rounded-[6px] border border-[var(--border)] p-4">
        <legend className="px-1 font-semibold">Рекомендации</legend>
        <label htmlFor="recommendations" className="form-label block">Рекомендации</label>
        <textarea id="recommendations" {...register('recommendations')} className={INPUT_CLASS} />
        {errors.recommendations ? <p role="alert" className="text-sm text-[var(--destructive)]">{errors.recommendations.message}</p> : null}
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
