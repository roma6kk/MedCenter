import { createUserSchema, editUserSchema, editValuesOf, EMPTY_CREATE_VALUES, toCreatePayload, toUpdatePayload, type CreateUserFormValues } from './user-schema';
import type { AdminUser } from './user-types';

const valid: CreateUserFormValues = {
  ...EMPTY_CREATE_VALUES,
  email: 'new@medcenter.test',
  firstName: ' Мария ',
  lastName: 'Иванова',
  password: 'Str0ng!Pass1',
  birthDate: '1990-05-12',
};

const doctor: AdminUser = {
  id: 'u1',
  email: 'doc@medcenter.test',
  firstName: 'Мария',
  lastName: 'Иванова',
  roles: ['DOCTOR'],
  patientRef: null,
  practitionerRoleRef: 'PractitionerRole/6ef5270b',
  isActive: true,
  name: 'Иванова Мария',
  role: 'DOCTOR',
};

function issuePaths(values: unknown, schema: typeof createUserSchema | typeof editUserSchema): ReadonlyArray<string> {
  const result = schema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('createUserSchema', () => {
  it('should accept a patient when a birth date and a strong password are given', () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it('should require the birth date when the account is a PATIENT', () => {
    expect(issuePaths({ ...valid, birthDate: '' }, createUserSchema)).toContain('birthDate');
  });

  it('should not require the birth date when the account has no PATIENT role', () => {
    expect(createUserSchema.safeParse({ ...valid, roles: ['ADMIN'], birthDate: '' }).success).toBe(true);
  });

  it('should accept an account that is not a DOCTOR when an old PractitionerRole id is still typed in the hidden field', () => {
    expect(createUserSchema.safeParse({ ...valid, practitionerRoleId: 'abc-123' }).success).toBe(true);
    expect(issuePaths({ ...valid, practitionerRoleId: 'a b/c' }, createUserSchema)).toEqual([]);
  });

  it('should accept a PractitionerRole id when the account is a DOCTOR', () => {
    const values = { ...valid, roles: ['DOCTOR'], birthDate: '', practitionerRoleId: '6ef5270b-6282-5a43-87f9-26d2d8b0c4f7' };

    expect(createUserSchema.safeParse(values).success).toBe(true);
  });

  it.each(['', 'short1!A', 'alllowercase1!', 'NoDigits!!!!a', 'NoSymbol1234ab', 'Кириллица1!аА'])('should refuse the password %j when the form is checked', (password) => {
    expect(issuePaths({ ...valid, password }, createUserSchema)).toContain('password');
  });

  it('should require at least one role and a valid email when they are missing', () => {
    const paths = issuePaths({ ...valid, roles: [], email: 'not-an-email' }, createUserSchema);

    expect(paths).toEqual(expect.arrayContaining(['roles', 'email']));
  });

  it('should refuse a PractitionerRole id when it has characters the server would not accept', () => {
    expect(issuePaths({ ...valid, roles: ['DOCTOR'], practitionerRoleId: 'a b/c' }, createUserSchema)).toContain('practitionerRoleId');
  });
});

describe('toCreatePayload', () => {
  it('should trim the names and leave empty optional fields out when the payload is built', () => {
    const payload = toCreatePayload({ ...valid, gender: '', practitionerRoleId: '' });

    expect(payload).toEqual({
      email: 'new@medcenter.test',
      firstName: 'Мария',
      lastName: 'Иванова',
      password: 'Str0ng!Pass1',
      roles: ['PATIENT'],
      birthDate: '1990-05-12',
    });
  });

  it('should leave the PractitionerRole out when the account is not a DOCTOR, even if the hidden field still holds an id', () => {
    expect(toCreatePayload({ ...valid, roles: ['ADMIN'], practitionerRoleId: 'role-1' })).not.toHaveProperty('practitionerRoleId');
  });

  it('should send the gender and the PractitionerRole when they are filled', () => {
    const payload = toCreatePayload({ ...valid, roles: ['DOCTOR'], gender: 'female', practitionerRoleId: 'role-1' });

    expect(payload).toMatchObject({ gender: 'female', practitionerRoleId: 'role-1' });
  });
});

describe('toUpdatePayload', () => {
  it('should send nothing when nothing changed', () => {
    expect(toUpdatePayload(editValuesOf(doctor), doctor)).toEqual({});
  });

  it('should send only the changed fields when the payload is built for an edit', () => {
    const values = { ...editValuesOf(doctor), firstName: 'Анна', isActive: false };

    expect(toUpdatePayload(values, doctor)).toEqual({ firstName: 'Анна', isActive: false });
  });

  it('should send the new role set when the roles changed regardless of their order', () => {
    expect(toUpdatePayload({ ...editValuesOf(doctor), roles: ['DOCTOR', 'ADMIN'] }, doctor)).toEqual({ roles: ['DOCTOR', 'ADMIN'] });
    expect(toUpdatePayload({ ...editValuesOf({ ...doctor, roles: ['DOCTOR', 'ADMIN'] }), roles: ['ADMIN', 'DOCTOR'] }, { ...doctor, roles: ['DOCTOR', 'ADMIN'] })).toEqual({});
  });

  it('should release the PractitionerRole link with null when the field is cleared', () => {
    expect(toUpdatePayload({ ...editValuesOf(doctor), practitionerRoleId: '' }, doctor)).toEqual({ practitionerRoleId: null });
  });

  it('should release the link with null when DOCTOR is unchecked on a linked doctor', () => {
    const values = { ...editValuesOf(doctor), roles: ['ADMIN' as const] };

    expect(editUserSchema.safeParse(values).success).toBe(true);
    expect(toUpdatePayload(values, doctor)).toEqual({ roles: ['ADMIN'], practitionerRoleId: null });
  });

  it('should send nothing about the link when DOCTOR is unchecked on a doctor that has none', () => {
    const unlinked: AdminUser = { ...doctor, practitionerRoleRef: null };

    expect(toUpdatePayload({ ...editValuesOf(unlinked), roles: ['ADMIN'] }, unlinked)).toEqual({ roles: ['ADMIN'] });
  });

  it('should send a new PractitionerRole id when the link changed', () => {
    expect(toUpdatePayload({ ...editValuesOf(doctor), practitionerRoleId: 'role-2' }, doctor)).toEqual({ practitionerRoleId: 'role-2' });
  });

  it('should not resend an unchanged link when the account is saved, which the server would refuse as already taken', () => {
    expect(toUpdatePayload(editValuesOf(doctor), doctor)).not.toHaveProperty('practitionerRoleId');
  });
});

describe('editUserSchema', () => {
  it('should not ask for a birth date when an account is edited', () => {
    expect(editUserSchema.safeParse(editValuesOf({ ...doctor, roles: ['PATIENT'], practitionerRoleRef: null })).success).toBe(true);
  });
});
