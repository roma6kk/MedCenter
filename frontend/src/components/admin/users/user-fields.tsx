'use client';

import type { ReactNode } from 'react';
import { Controller, type Control, type UseFormRegisterReturn } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { clinicDateKey } from '@/lib/clinic-time';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS } from '../shared/admin-styles';
import type { FieldMessages } from '../shared/form-errors';
import { controlProps, Field, Fieldset } from '../shared/form-field';
import type { PractitionerRoleChoices } from './use-practitioner-role-options';
import type { CreateUserFormValues } from './user-schema';
import { USER_ROLES, type UserRole } from './user-types';

export type SharedUserField = 'email' | 'firstName' | 'lastName' | 'roles' | 'practitionerRoleId';
export type CreateOnlyField = 'password' | 'birthDate' | 'gender';

export interface RoleNotes {
  readonly patientLocked: boolean;
  readonly releasesLink: boolean;
}

export const NO_ROLE_NOTES: RoleNotes = { patientLocked: false, releasesLink: false };

interface SharedFieldsProps {
  readonly register: (name: SharedUserField) => UseFormRegisterReturn;
  readonly errors: FieldMessages<SharedUserField>;
  readonly selectedRoles: ReadonlyArray<UserRole>;
  readonly notes?: RoleNotes;
  readonly roleChoices?: PractitionerRoleChoices;
}

type Registrations = Readonly<Record<SharedUserField, UseFormRegisterReturn>>;

interface RoleCheckboxesProps {
  readonly registration: UseFormRegisterReturn;
  readonly error: string | undefined;
  readonly notes: RoleNotes;
}

function RoleCheckboxes({ registration, error, notes }: RoleCheckboxesProps): ReactNode {
  const t = useT('admin.users');
  return (
    <Fieldset id="user-roles" legend={t('fields.roles')} error={error}>
      {USER_ROLES.map((role) => (
        <Checkbox key={role} value={role} disabled={role === 'PATIENT' && notes.patientLocked} {...registration}>
          {t(`roleNames.${role}`)}
        </Checkbox>
      ))}
      {notes.patientLocked ? <p className="basis-full text-xs text-[var(--muted-foreground)]">{t('hints.patientLocked')}</p> : null}
    </Fieldset>
  );
}

interface PractitionerRoleFieldProps {
  readonly registration: UseFormRegisterReturn;
  readonly error: string | undefined;
  readonly choices: PractitionerRoleChoices;
}

function PractitionerRoleField({ registration, error, choices }: PractitionerRoleFieldProps): ReactNode {
  const t = useT('admin.users');
  if (choices.state === 'unavailable') {
    const hint: string = t('hints.practitionerRoleIdTyped');
    return (
      <Field id="user-practitioner-role" label={t('fields.practitionerRoleId')} error={error} hint={hint}>
        <input {...controlProps('user-practitioner-role', error, hint)} autoComplete="off" className={`${CONTROL_CLASS} mono`} {...registration} />
      </Field>
    );
  }
  const hint: string = t('hints.practitionerRoleId');
  const options = choices.state === 'ready' ? choices.options : [];
  return (
    <Field id="user-practitioner-role" label={t('fields.practitionerRoleId')} error={error} hint={hint}>
      <Select {...controlProps('user-practitioner-role', error, hint)} disabled={choices.state === 'pending'} {...registration}>
        <option value="">{choices.state === 'pending' ? t('roleOptionsLoading') : t('roleNotLinked')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function NameFields({ registrations, errors }: { readonly registrations: Registrations; readonly errors: SharedFieldsProps['errors'] }): ReactNode {
  const t = useT('admin.users');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id="user-last-name" label={t('fields.lastName')} error={errors.lastName} required>
        <input {...controlProps('user-last-name', errors.lastName)} autoComplete="off" className={CONTROL_CLASS} {...registrations.lastName} />
      </Field>
      <Field id="user-first-name" label={t('fields.firstName')} error={errors.firstName} required>
        <input {...controlProps('user-first-name', errors.firstName)} autoComplete="off" className={CONTROL_CLASS} {...registrations.firstName} />
      </Field>
    </div>
  );
}

export function SharedUserFields({ register, errors, selectedRoles, notes = NO_ROLE_NOTES, roleChoices = { state: 'unavailable' } }: SharedFieldsProps): ReactNode {
  const t = useT('admin.users');
  // Registered in screen order here: react-hook-form focuses the first invalid field in the order they were registered.
  const registrations: Registrations = {
    lastName: register('lastName'),
    firstName: register('firstName'),
    email: register('email'),
    roles: register('roles'),
    practitionerRoleId: register('practitionerRoleId'),
  };
  return (
    <div className="mt-4 grid gap-3">
      <NameFields registrations={registrations} errors={errors} />
      <Field id="user-email" label={t('fields.email')} error={errors.email} required>
        <input {...controlProps('user-email', errors.email)} type="email" autoComplete="off" className={CONTROL_CLASS} {...registrations.email} />
      </Field>
      <RoleCheckboxes registration={registrations.roles} error={errors.roles} notes={notes} />
      {selectedRoles.includes('DOCTOR') ? <PractitionerRoleField registration={registrations.practitionerRoleId} error={errors.practitionerRoleId} choices={roleChoices} /> : null}
      {notes.releasesLink ? <p className="text-sm text-[var(--muted-foreground)]">{t('hints.linkReleased')}</p> : null}
    </div>
  );
}

interface CreateOnlyProps {
  readonly register: (name: CreateOnlyField) => UseFormRegisterReturn;
  readonly control: Control<CreateUserFormValues>;
  readonly errors: FieldMessages<CreateOnlyField>;
  readonly selectedRoles: ReadonlyArray<UserRole>;
}

export function CreateOnlyUserFields({ register, control, errors, selectedRoles }: CreateOnlyProps): ReactNode {
  const t = useT('admin.users');
  const passwordHint: string = t('hints.password');
  return (
    <div className="mt-3 grid gap-3">
      <Field id="user-password" label={t('fields.password')} error={errors.password} hint={passwordHint} required>
        <input {...controlProps('user-password', errors.password, passwordHint)} type="password" autoComplete="new-password" className={CONTROL_CLASS} {...register('password')} />
      </Field>
      {selectedRoles.includes('PATIENT') ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="user-birth-date" label={t('fields.birthDate')} error={errors.birthDate} required>
            <Controller control={control} name="birthDate" render={({ field }) => <DatePicker {...controlProps('user-birth-date', errors.birthDate)} {...field} max={clinicDateKey()} aria-required />} />
          </Field>
          <Field id="user-gender" label={t('fields.gender')} error={errors.gender}>
            <Select {...controlProps('user-gender', errors.gender)} {...register('gender')}>
              <option value="">{t('genderNames.unset')}</option>
              <option value="female">{t('genderNames.female')}</option>
              <option value="male">{t('genderNames.male')}</option>
            </Select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}
