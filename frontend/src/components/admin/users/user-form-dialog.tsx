'use client';

import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useT } from '@/lib/i18n/use-t';
import { FormProblem } from '../shared/admin-problem';
import type { ServerFieldRule } from '../shared/apply-server-error';
import { FormActions } from '../shared/form-actions';
import { messagesOf } from '../shared/form-errors';
import { Modal } from '../shared/modal';
import { useFormBanner } from '../shared/use-form-banner';
import { useFormMessage } from '../shared/use-form-message';
import { useCreateUser, useUpdateUser } from './use-admin-users';
import { usePractitionerRoleOptions } from './use-practitioner-role-options';
import { CreateOnlyUserFields, SharedUserFields, type CreateOnlyField, type RoleNotes, type SharedUserField } from './user-fields';
import {
  createUserSchema,
  editUserSchema,
  EMPTY_CREATE_VALUES,
  editValuesOf,
  toCreatePayload,
  toUpdatePayload,
  type CreateUserFormValues,
  type EditUserFormValues,
} from './user-schema';
import type { AdminUser } from './user-types';

const CREATE_FIELDS: ReadonlyArray<string> = ['email', 'firstName', 'lastName', 'password', 'roles', 'birthDate', 'gender', 'practitionerRoleId'];
const EDIT_FIELDS: ReadonlyArray<string> = ['email', 'firstName', 'lastName', 'roles', 'practitionerRoleId', 'isActive'];

/**
 * Server reasons that belong to one field. A 404 can only mean an unknown PractitionerRole (the account is the one being
 * edited, a new account has no id yet), so it goes to the role field, but only while that field is shown.
 */
function useServerRules(showsRoleField: boolean): Readonly<Record<string, ServerFieldRule>> {
  const t = useT('admin.problems');
  return {
    EMAIL_TAKEN: { field: 'email', message: t('EMAIL_TAKEN') },
    PRACTITIONER_ROLE_TAKEN: { field: 'practitionerRoleId', message: t('PRACTITIONER_ROLE_TAKEN') },
    ...(showsRoleField ? { NOT_FOUND: { field: 'practitionerRoleId', message: t('PRACTITIONER_ROLE_NOT_FOUND') } } : {}),
  };
}

function CreateUserForm({ onClose }: { readonly onClose: () => void }): ReactNode {
  const t = useT('admin.users');
  const resolve = useFormMessage();
  const create = useCreateUser();
  const form = useForm<CreateUserFormValues>({ resolver: zodResolver(createUserSchema), defaultValues: EMPTY_CREATE_VALUES });
  const { register, handleSubmit, watch, formState } = form;
  const roles = watch('roles');
  const roleChoices = usePractitionerRoleOptions(undefined, watch('practitionerRoleId'));
  const { banner, fail, clear } = useFormBanner(form, CREATE_FIELDS, useServerRules(roles.includes('DOCTOR')));
  const submit = handleSubmit((values) => {
    clear();
    create.mutate(toCreatePayload(values), { onSuccess: onClose, onError: fail });
  }, clear);
  const errors = messagesOf<SharedUserField | CreateOnlyField, CreateUserFormValues>(formState.errors, resolve);
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <SharedUserFields register={register} errors={errors} selectedRoles={roles} roleChoices={roleChoices} />
      <CreateOnlyUserFields register={register} errors={errors} selectedRoles={roles} />
      <FormProblem banner={banner} />
      <FormActions submitLabel={t('create')} isPending={create.isPending} onCancel={onClose} error={create.error} />
    </form>
  );
}

/** What the roles of an existing account allow: PATIENT needs a FHIR Patient it may not have, and a link needs DOCTOR. */
function roleNotesOf(user: AdminUser, selectedRoles: ReadonlyArray<string>): RoleNotes {
  return {
    patientLocked: user.patientRef === null && !user.roles.includes('PATIENT'),
    releasesLink: user.practitionerRoleRef !== null && !selectedRoles.includes('DOCTOR'),
  };
}

function EditUserForm({ user, onClose }: { readonly user: AdminUser; readonly onClose: () => void }): ReactNode {
  const t = useT('admin.users');
  const resolve = useFormMessage();
  const update = useUpdateUser();
  const form = useForm<EditUserFormValues>({ resolver: zodResolver(editUserSchema), defaultValues: editValuesOf(user) });
  const { register, handleSubmit, watch, formState } = form;
  const roles = watch('roles');
  const roleChoices = usePractitionerRoleOptions(user.id, watch('practitionerRoleId'));
  const { banner, fail, clear } = useFormBanner(form, EDIT_FIELDS, useServerRules(roles.includes('DOCTOR')));
  const submit = handleSubmit((values) => {
    clear();
    update.mutate({ id: user.id, payload: toUpdatePayload(values, user) }, { onSuccess: onClose, onError: fail });
  }, clear);
  const errors = messagesOf<SharedUserField, EditUserFormValues>(formState.errors, resolve);
  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <SharedUserFields register={register} errors={errors} selectedRoles={roles} notes={roleNotesOf(user, roles)} roleChoices={roleChoices} />
      <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm">
        <input type="checkbox" {...register('isActive')} />
        {t('fields.isActive')}
      </label>
      <FormProblem banner={banner} />
      <FormActions submitLabel={t('save')} isPending={update.isPending} onCancel={onClose} error={update.error} />
    </form>
  );
}

interface UserFormDialogProps {
  /** The account to edit; omitted → the «create user» form. */
  readonly user?: AdminUser;
  readonly onClose: () => void;
}

/** Create (`POST /admin/users`) or edit (`PATCH /admin/users/{id}`) dialog of an account (FR-015). */
export function UserFormDialog({ user, onClose }: UserFormDialogProps): ReactNode {
  const t = useT('admin.users');
  return (
    <Modal title={user === undefined ? t('createTitle') : t('editTitle')} onClose={onClose}>
      {user === undefined ? <CreateUserForm onClose={onClose} /> : <EditUserForm user={user} onClose={onClose} />}
    </Modal>
  );
}
