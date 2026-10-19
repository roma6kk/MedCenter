/**
 * user-schema — the admin user form, with the same limits as the class-validator DTOs of auth-service
 * (`CreateUserDto` / `UpdateUserDto`, api-designer-spec §2.2). Messages are message KEYS resolved by `useFormMessage`.
 */
import { z } from 'zod';
import { EMAIL_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, PASSWORD_PATTERN, isCalendarDate } from '@/lib/contracts';
import { FHIR_ID_PATTERN } from '../shared/fhir-id';
import { referenceId, type AdminUser, type CreateUserPayload, type UpdateUserPayload, type UserRole } from './user-types';

const ROLE = z.enum(['PATIENT', 'DOCTOR', 'ADMIN']);

const baseShape = {
  email: z.string().min(1, 'validation.required').email('validation.email').max(EMAIL_MAX, 'validation.tooLong'),
  firstName: z.string().trim().min(1, 'validation.required').max(NAME_MAX, 'validation.tooLong'),
  lastName: z.string().trim().min(1, 'validation.required').max(NAME_MAX, 'validation.tooLong'),
  roles: z.array(ROLE).min(1, 'admin.users.validation.rolesRequired'),
  practitionerRoleId: z.string(),
};

const createShape = {
  ...baseShape,
  password: z.string().min(PASSWORD_MIN, 'validation.passwordStrength').max(PASSWORD_MAX, 'validation.tooLong').regex(PASSWORD_PATTERN, 'validation.passwordStrength'),
  birthDate: z.string().refine((value) => value === '' || isCalendarDate(value), 'validation.date'),
  gender: z.enum(['', 'male', 'female']),
};

type CreateValues = z.infer<z.ZodObject<typeof createShape>>;

type RoleValues = Pick<CreateValues, 'roles' | 'practitionerRoleId'> & { birthDate?: string };

/**
 * The PractitionerRole id the account really gets: only a DOCTOR has one. The field is shown only while DOCTOR is chosen, so
 * what stays typed in it after DOCTOR is unchecked is not sent (a linked doctor loses the link) and is not validated either:
 * an error on a field nobody can see would block the submit without a word.
 */
export function effectiveLink(values: Pick<RoleValues, 'roles' | 'practitionerRoleId'>): string {
  return values.roles.includes('DOCTOR') ? values.practitionerRoleId : '';
}

/** Cross-field rules of the server (`account-rules.ts`): a PATIENT needs a birth date, a visible PractitionerRole id is a FHIR id. */
function checkRoleRules(values: RoleValues, ctx: z.RefinementCtx, needsBirthDate: boolean): void {
  if (needsBirthDate && values.roles.includes('PATIENT') && (values.birthDate ?? '') === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'admin.users.validation.birthDateRequired' });
  }
  const link: string = effectiveLink(values);
  if (link !== '' && !FHIR_ID_PATTERN.test(link)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['practitionerRoleId'], message: 'admin.validation.fhirId' });
  }
}

export const createUserSchema = z.object(createShape).superRefine((values, ctx) => checkRoleRules(values, ctx, true));

export const editUserSchema = z
  .object({ ...baseShape, isActive: z.boolean() })
  .superRefine((values, ctx) => checkRoleRules(values, ctx, false));

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
export type EditUserFormValues = z.infer<typeof editUserSchema>;

export const EMPTY_CREATE_VALUES: CreateUserFormValues = {
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  roles: ['PATIENT'],
  birthDate: '',
  gender: '',
  practitionerRoleId: '',
};

export function editValuesOf(user: AdminUser): EditUserFormValues {
  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: [...user.roles],
    practitionerRoleId: referenceId(user.practitionerRoleRef),
    isActive: user.isActive,
  };
}

/** The body of `POST /admin/users`: empty optional fields are left out (the DTO whitelist rejects `""`). */
export function toCreatePayload(values: CreateUserFormValues): CreateUserPayload {
  return {
    email: values.email.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    password: values.password,
    roles: values.roles,
    ...(values.birthDate === '' ? {} : { birthDate: values.birthDate }),
    ...(values.gender === '' ? {} : { gender: values.gender }),
    ...(effectiveLink(values) === '' ? {} : { practitionerRoleId: effectiveLink(values) }),
  };
}

function sameRoles(a: ReadonlyArray<UserRole>, b: ReadonlyArray<UserRole>): boolean {
  return a.length === b.length && a.every((role) => b.includes(role));
}

function linkChange(link: string, originalLink: string): UpdateUserPayload {
  if (link === originalLink) return {};
  return { practitionerRoleId: link === '' ? null : link };
}

/**
 * The body of `PATCH /admin/users/{id}`: only what changed. A cleared PractitionerRole releases the link (`null`);
 * sending an unchanged link again would be refused as already taken.
 */
export function toUpdatePayload(values: EditUserFormValues, original: AdminUser): UpdateUserPayload {
  return {
    ...(values.email.trim() === original.email ? {} : { email: values.email.trim() }),
    ...(values.firstName.trim() === original.firstName ? {} : { firstName: values.firstName.trim() }),
    ...(values.lastName.trim() === original.lastName ? {} : { lastName: values.lastName.trim() }),
    ...(sameRoles(values.roles, original.roles) ? {} : { roles: values.roles }),
    ...(values.isActive === original.isActive ? {} : { isActive: values.isActive }),
    ...linkChange(effectiveLink(values), referenceId(original.practitionerRoleRef)),
  };
}
