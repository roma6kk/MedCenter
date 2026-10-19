'use client';

import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { CONTROL_CLASS } from '../shared/admin-styles';
import type { FieldMessages } from '../shared/form-errors';
import { controlProps, Field, Fieldset } from '../shared/form-field';
import { USER_ROLES, type UserRole } from './user-types';

export type SharedUserField = 'email' | 'firstName' | 'lastName' | 'roles' | 'practitionerRoleId';
export type CreateOnlyField = 'password' | 'birthDate' | 'gender';

/** What the form must tell the admin about the roles: a role that cannot be added, and a link that the new role set drops. */
export interface RoleNotes {
  /** `true` for an existing account without a FHIR `Patient`: the server refuses to add PATIENT to it. */
  readonly patientLocked: boolean;
  /** `true` when DOCTOR is unchecked on a doctor that is linked to a PractitionerRole: saving releases the link. */
  readonly releasesLink: boolean;
}

export const NO_ROLE_NOTES: RoleNotes = { patientLocked: false, releasesLink: false };

interface SharedFieldsProps {
  readonly register: (name: SharedUserField) => UseFormRegisterReturn;
  readonly errors: FieldMessages<SharedUserField>;
  readonly selectedRoles: ReadonlyArray<UserRole>;
  readonly notes?: RoleNotes;
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
        <label key={role} className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" value={role} disabled={role === 'PATIENT' && notes.patientLocked} {...registration} />
          {t(`roleNames.${role}`)}
        </label>
      ))}
      {notes.patientLocked ? <p className="basis-full text-xs text-[var(--muted-foreground)]">{t('hints.patientLocked')}</p> : null}
    </Fieldset>
  );
}

function PractitionerRoleField({ registration, error }: { readonly registration: UseFormRegisterReturn; readonly error: string | undefined }): ReactNode {
  const t = useT('admin.users');
  const hint: string = t('hints.practitionerRoleId');
  return (
    <Field id="user-practitioner-role" label={t('fields.practitionerRoleId')} error={error} hint={hint}>
      <input {...controlProps('user-practitioner-role', error, hint)} autoComplete="off" className={`${CONTROL_CLASS} mono`} {...registration} />
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

/** Fields both the create and the edit form have: name, email, roles and — for a DOCTOR — the PractitionerRole link. */
export function SharedUserFields({ register, errors, selectedRoles, notes = NO_ROLE_NOTES }: SharedFieldsProps): ReactNode {
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
      {selectedRoles.includes('DOCTOR') ? <PractitionerRoleField registration={registrations.practitionerRoleId} error={errors.practitionerRoleId} /> : null}
      {notes.releasesLink ? <p className="text-sm text-[var(--muted-foreground)]">{t('hints.linkReleased')}</p> : null}
    </div>
  );
}

interface CreateOnlyProps {
  readonly register: (name: CreateOnlyField) => UseFormRegisterReturn;
  readonly errors: FieldMessages<CreateOnlyField>;
  readonly selectedRoles: ReadonlyArray<UserRole>;
}

/** Only a new account has a password, and only a PATIENT needs the birth date and gender for its FHIR `Patient`. */
export function CreateOnlyUserFields({ register, errors, selectedRoles }: CreateOnlyProps): ReactNode {
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
            <input {...controlProps('user-birth-date', errors.birthDate)} type="date" className={CONTROL_CLASS} {...register('birthDate')} />
          </Field>
          <Field id="user-gender" label={t('fields.gender')} error={errors.gender}>
            <select {...controlProps('user-gender', errors.gender)} className={CONTROL_CLASS} {...register('gender')}>
              <option value="">{t('genderNames.unset')}</option>
              <option value="female">{t('genderNames.female')}</option>
              <option value="male">{t('genderNames.male')}</option>
            </select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}
