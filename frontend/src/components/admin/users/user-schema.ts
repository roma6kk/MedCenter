import { z } from 'zod';
import { clinicDateKey } from '@/lib/clinic-time';
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

const passwordRule = z.string().min(PASSWORD_MIN, 'validation.passwordStrength').max(PASSWORD_MAX, 'validation.tooLong').regex(PASSWORD_PATTERN, 'validation.passwordStrength');

const createShape = {
  ...baseShape,
  password: passwordRule,
  birthDate: z.string().refine((value) => value === '' || isCalendarDate(value), 'validation.date'),
  gender: z.enum(['', 'male', 'female']),
  specialtyCode: z.string(),
};

type CreateValues = z.infer<z.ZodObject<typeof createShape>>;

type RoleValues = Pick<CreateValues, 'roles' | 'practitionerRoleId'> & { birthDate?: string };

// Only a DOCTOR has a PractitionerRole id: the field is hidden otherwise, so what stays typed in it is neither sent nor validated.
function effectiveLink(values: Pick<RoleValues, 'roles' | 'practitionerRoleId'>): string {
  return values.roles.includes('DOCTOR') ? values.practitionerRoleId : '';
}

function checkRoleRules(values: RoleValues, ctx: z.RefinementCtx, needsBirthDate: boolean): void {
  if (needsBirthDate && values.roles.includes('PATIENT') && (values.birthDate ?? '') === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'admin.users.validation.birthDateRequired' });
  }
  // A typed date is not held to the calendar's `max`, so a birth date after today is refused here (the clock is read now, not at import).
  const birthDate: string = values.birthDate ?? '';
  if (isCalendarDate(birthDate) && birthDate > clinicDateKey()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthDate'], message: 'admin.users.validation.birthDateFuture' });
  }
  const link: string = effectiveLink(values);
  if (link !== '' && !FHIR_ID_PATTERN.test(link)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['practitionerRoleId'], message: 'admin.validation.fhirId' });
  }
}

export const createUserSchema = z.object(createShape).superRefine((values, ctx) => {
  checkRoleRules(values, ctx, true);
  if (values.roles.includes('DOCTOR') && values.specialtyCode === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['specialtyCode'], message: 'admin.users.validation.specialtyRequired' });
  }
});

export const editUserSchema = z
  .object({ ...baseShape, isActive: z.boolean(), password: z.union([z.literal(''), passwordRule]) })
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
  specialtyCode: '',
};

export function editValuesOf(user: AdminUser): EditUserFormValues {
  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: [...user.roles],
    practitionerRoleId: referenceId(user.practitionerRoleRef),
    isActive: user.isActive,
    password: '',
  };
}

export function toCreatePayload(values: CreateUserFormValues): CreateUserPayload {
  return {
    email: values.email.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    password: values.password,
    roles: values.roles,
    ...(values.birthDate === '' ? {} : { birthDate: values.birthDate }),
    ...(values.gender === '' ? {} : { gender: values.gender }),
    ...(values.roles.includes('DOCTOR') && values.specialtyCode !== '' ? { specialtyCode: values.specialtyCode } : {}),
  };
}

function sameRoles(a: ReadonlyArray<UserRole>, b: ReadonlyArray<UserRole>): boolean {
  return a.length === b.length && a.every((role) => b.includes(role));
}

function linkChange(link: string, originalLink: string): UpdateUserPayload {
  if (link === originalLink) return {};
  return { practitionerRoleId: link === '' ? null : link };
}

// Only what changed: a cleared PractitionerRole releases the link (`null`); sending an unchanged link again is refused as already taken.
export function toUpdatePayload(values: EditUserFormValues, original: AdminUser): UpdateUserPayload {
  return {
    ...(values.email.trim() === original.email ? {} : { email: values.email.trim() }),
    ...(values.firstName.trim() === original.firstName ? {} : { firstName: values.firstName.trim() }),
    ...(values.lastName.trim() === original.lastName ? {} : { lastName: values.lastName.trim() }),
    ...(sameRoles(values.roles, original.roles) ? {} : { roles: values.roles }),
    ...(values.isActive === original.isActive ? {} : { isActive: values.isActive }),
    ...(values.password === '' ? {} : { password: values.password }),
    ...linkChange(effectiveLink(values), referenceId(original.practitionerRoleRef)),
  };
}
