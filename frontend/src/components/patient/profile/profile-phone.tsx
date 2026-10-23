'use client';

import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/api-fetch';
import { applyProblemToForm } from '@/lib/api/field-errors';
import type { ProblemDetails } from '@/lib/api/problem';
import { normaliseBelarusPhone } from '@/lib/contracts';
import { useT } from '@/lib/i18n/use-t';
import { FormField, INPUT_CLASS } from '../form-field';
import type { PatientProfile } from '../patient-types';
import { useUpdateMyPhone } from '../use-patient-queries';
import { phoneOf } from './profile-completeness';

const phoneSchema = z.object({
  phone: z.string().trim().refine((value) => normaliseBelarusPhone(value) !== null, { message: 'validation.phone' }),
});

type PhoneValues = z.infer<typeof phoneSchema>;

interface PhoneFormProps {
  readonly patient: PatientProfile & { readonly version: string };
  readonly onClose: () => void;
}

/** Edit form of the phone (3.12): the number is normalised before it is sent, the card `version` rides along as `If-Match`. */
function PhoneForm({ patient, onClose }: PhoneFormProps): ReactNode {
  const t = useT('patientProfile.data');
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const [conflict, setConflict] = useState(false);
  const update = useUpdateMyPhone();
  const { register, handleSubmit, setError, setFocus, formState: { errors } } = useForm<PhoneValues>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: phoneOf(patient) ?? '' },
  });
  const fail = (error: unknown): void => {
    if (!isApiError(error)) return;
    if (error.errorCode === 'CONFLICT') {
      setConflict(true);
      return;
    }
    const unmatched: ReadonlyArray<string> = applyProblemToForm(error.problem, setError, ['phone']);
    const hasFieldErrors: boolean = (error.problem.details?.length ?? 0) > unmatched.length;
    if (hasFieldErrors) setFocus('phone');
    else setProblem(error.problem);
  };
  const submit = handleSubmit((values) => {
    setProblem(null);
    setConflict(false);
    update.mutate({ phone: normaliseBelarusPhone(values.phone) ?? values.phone, version: patient.version }, { onSuccess: onClose, onError: fail });
  });
  return (
    <form data-testid="phone-form" onSubmit={submit} noValidate className="grid gap-2">
      <FormField id="profile-phone" label={t('phoneLabel')} hint={t('phoneHint')} error={errors.phone?.message}>
        {(control) => <input {...control} type="tel" autoComplete="tel" inputMode="tel" {...register('phone')} className={INPUT_CLASS} />}
      </FormField>
      {conflict ? <p role="alert" className="text-sm text-[var(--destructive)]">{t('phoneConflict')}</p> : null}
      {problem !== null ? <ProblemBanner problem={problem} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" aria-disabled={update.isPending ? true : undefined} aria-busy={update.isPending}>{update.isPending ? t('phoneSaving') : t('phoneSave')}</Button>
        <Button variant="ghost" onClick={onClose}>{t('phoneCancel')}</Button>
      </div>
    </form>
  );
}

/** The phone line of the card: the number (or the "not specified" warning) and the way to change it. */
export function PhoneValue({ patient }: { readonly patient: PatientProfile }): ReactNode {
  const t = useT('patientProfile.data');
  const [editing, setEditing] = useState(false);
  const phone: string | undefined = phoneOf(patient);
  const { version } = patient;
  if (editing && version !== undefined) return <PhoneForm patient={{ ...patient, version }} onClose={() => setEditing(false)} />;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {phone === undefined ? <span className="font-semibold text-warning">{t('phoneMissing')}</span> : <span>{phone}</span>}
      {version === undefined ? null : <Button variant="secondary" onClick={() => setEditing(true)}>{phone === undefined ? t('phoneAdd') : t('phoneEdit')}</Button>}
    </div>
  );
}
