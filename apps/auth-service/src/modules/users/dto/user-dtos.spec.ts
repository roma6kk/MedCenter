import { pipeline, violationsOf } from '../../../__tests__/validation-helper';
import { CreateUserDto } from './create-user.dto';
import { ListUsersQueryDto } from './list-users-query.dto';
import { RegisterPatientDto } from './register-patient.dto';
import { UpdateUserDto } from './update-user.dto';

const LONG_NAME = 'А'.repeat(101);
const LONG_EMAIL = `${'a'.repeat(250)}@example.by`;
const LONG_PASSWORD = `Aa1!${'x'.repeat(125)}`;

type Body = Readonly<Record<string, unknown>>;
type InvalidCase = readonly [label: string, overrides: Body, property: string];

/** `undefined` removes the property from the body. */
function bodyOf(base: Body, overrides: Body): Body {
  return Object.fromEntries(
    Object.entries({ ...base, ...overrides }).filter(([, value]) => value !== undefined),
  );
}

const CREATE: Body = {
  email: 'petrov@example.by',
  firstName: 'Пётр',
  lastName: 'Петров',
  password: 'Str0ng!Pass',
  roles: ['DOCTOR'],
};

const PASSWORD_CASES: ReadonlyArray<InvalidCase> = [
  ['the password is missing', { password: undefined }, 'password'],
  ['the password is shorter than 10 characters', { password: 'Sh0rt!Aa' }, 'password'],
  ['the password has no upper-case letter', { password: 'str0ng!pass' }, 'password'],
  ['the password has no digit', { password: 'Strong!Pass' }, 'password'],
  ['the password has no symbol', { password: 'Str0ngPassw' }, 'password'],
  ['the password is longer than 128 characters', { password: LONG_PASSWORD }, 'password'],
  ['the password is not a string', { password: 1234567890 }, 'password'],
];

const IDENTITY_CASES: ReadonlyArray<InvalidCase> = [
  ['the email is missing', { email: undefined }, 'email'],
  ['the email is malformed', { email: 'not-an-email' }, 'email'],
  ['the email is longer than 255 characters', { email: LONG_EMAIL }, 'email'],
  ['the first name is empty', { firstName: '' }, 'firstName'],
  ['the first name is longer than 100 characters', { firstName: LONG_NAME }, 'firstName'],
  ['the last name is missing', { lastName: undefined }, 'lastName'],
  ['the last name is not a string', { lastName: 42 }, 'lastName'],
];

const PATIENT_FIELD_CASES: ReadonlyArray<InvalidCase> = [
  ['the birth date carries a time', { birthDate: '1990-05-12T00:00:00Z' }, 'birthDate'],
  ['the birth date is not a calendar day', { birthDate: '1990-02-31' }, 'birthDate'],
  ['the birth date is not ISO formatted', { birthDate: '12.05.1990' }, 'birthDate'],
  ['the birth date is JSON null', { birthDate: null }, 'birthDate'],
  ['the gender is outside the supported set', { gender: 'other' }, 'gender'],
  ['the gender is JSON null', { gender: null }, 'gender'],
];

const ROLE_CASES: ReadonlyArray<InvalidCase> = [
  ['the roles are missing', { roles: undefined }, 'roles'],
  ['the roles list is empty', { roles: [] }, 'roles'],
  ['the roles are a bare string', { roles: 'ADMIN' }, 'roles'],
  ['a role is outside the enum', { roles: ['SUPERUSER'] }, 'roles'],
  ['a role is repeated', { roles: ['ADMIN', 'ADMIN'] }, 'roles'],
  ['the roles are JSON null', { roles: null }, 'roles'],
];

const ROLE_LINK_CASES: ReadonlyArray<InvalidCase> = [
  ['the PractitionerRole id is empty', { practitionerRoleId: '' }, 'practitionerRoleId'],
  ['the PractitionerRole id has a space', { practitionerRoleId: 'role 7' }, 'practitionerRoleId'],
  ['the PractitionerRole id is dots only', { practitionerRoleId: '..' }, 'practitionerRoleId'],
  [
    'the PractitionerRole id is longer than 64 characters',
    { practitionerRoleId: 'r'.repeat(65) },
    'practitionerRoleId',
  ],
  ['the PractitionerRole id is a number', { practitionerRoleId: 7 }, 'practitionerRoleId'],
];

describe('CreateUserDto (POST /api/v1/admin/users)', () => {
  const INVALID = [
    ...IDENTITY_CASES,
    ...PASSWORD_CASES,
    ...ROLE_CASES,
    ...PATIENT_FIELD_CASES,
    ...ROLE_LINK_CASES,
  ];

  it('should accept the minimal body when only the required fields are present', async () => {
    expect(await violationsOf(CreateUserDto, CREATE)).toEqual([]);
  });

  it('should accept a PATIENT body when it carries birthDate and gender', async () => {
    const body = bodyOf(CREATE, { roles: ['PATIENT'], birthDate: '1990-05-12', gender: 'female' });

    expect(await violationsOf(CreateUserDto, body)).toEqual([]);
  });

  it('should accept a DOCTOR body when it names the PractitionerRole to link', async () => {
    expect(
      await violationsOf(CreateUserDto, bodyOf(CREATE, { practitionerRoleId: 'role-7' })),
    ).toEqual([]);
  });

  it.each(INVALID)('should reject the body when %s', async (_label, overrides, property) => {
    const violations = await violationsOf(CreateUserDto, bodyOf(CREATE, overrides));

    expect(violations.join('; ')).toContain(property);
  });

  it('should reject practitionerRoleId null because releasing a link only makes sense on PATCH', async () => {
    const violations = await violationsOf(
      CreateUserDto,
      bodyOf(CREATE, { practitionerRoleId: null }),
    );

    expect(violations.join('; ')).toContain('practitionerRoleId');
  });

  it('should drop properties no DTO declares when the body carries them', async () => {
    const dto = await pipeline(
      CreateUserDto,
      bodyOf(CREATE, { isActive: false, passwordHash: 'x', id: 'forged' }),
    );

    expect(dto).not.toHaveProperty('isActive');
    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto).not.toHaveProperty('id');
  });
});

describe('UpdateUserDto (PATCH /api/v1/admin/users/{id})', () => {
  const NULL_FIELDS = [
    'email',
    'firstName',
    'lastName',
    'birthDate',
    'gender',
    'roles',
    'isActive',
  ] as const;

  const INVALID: ReadonlyArray<InvalidCase> = [
    ['the email is malformed', { email: 'nope' }, 'email'],
    ['the first name is empty', { firstName: '' }, 'firstName'],
    ['the last name is longer than 100 characters', { lastName: LONG_NAME }, 'lastName'],
    ['the birth date is not a calendar day', { birthDate: '1990-13-01' }, 'birthDate'],
    ['the gender is outside the supported set', { gender: 'unknown' }, 'gender'],
    ['the roles list is empty', { roles: [] }, 'roles'],
    ['a role is outside the enum', { roles: ['NURSE'] }, 'roles'],
    ['a role is repeated', { roles: ['DOCTOR', 'DOCTOR'] }, 'roles'],
    ['isActive is a string', { isActive: 'false' }, 'isActive'],
    ...ROLE_LINK_CASES,
  ];

  it('should accept an empty body because every field of a PATCH is optional', async () => {
    expect(await violationsOf(UpdateUserDto, {})).toEqual([]);
  });

  it('should accept every field at once when each value is valid', async () => {
    const body = {
      email: 'new@example.by',
      firstName: 'Иван',
      lastName: 'Сидоров',
      birthDate: '1985-01-31',
      gender: 'male',
      roles: ['DOCTOR'],
      isActive: false,
      practitionerRoleId: 'role-9',
    };

    expect(await violationsOf(UpdateUserDto, body)).toEqual([]);
  });

  it('should accept practitionerRoleId null because that is how a link is released', async () => {
    expect(await violationsOf(UpdateUserDto, { practitionerRoleId: null })).toEqual([]);
  });

  it.each(INVALID)('should reject the body when %s', async (_label, overrides, property) => {
    const violations = await violationsOf(UpdateUserDto, overrides);

    expect(violations.join('; ')).toContain(property);
  });

  // Reviewer finding m-1: `@IsOptional()` lets JSON null through, and the service then
  // answered 500 (email, roles) or stored null in a NOT NULL column (isActive, names).
  it.each(NULL_FIELDS)('should reject JSON null when %s is patched', async (field) => {
    const violations = await violationsOf(UpdateUserDto, { [field]: null });

    expect(violations.join('; ')).toContain(field);
  });
});

describe('RegisterPatientDto (POST /api/v1/auth/register)', () => {
  const REGISTER: Body = {
    email: 'ivanov@example.by',
    firstName: 'Иван',
    lastName: 'Иванов',
    password: 'Str0ng!Pass',
    birthDate: '1990-05-12',
    accountConsent: { accepted: true, textVersion: '2026-10' },
  };
  const INVALID: ReadonlyArray<InvalidCase> = [
    ...IDENTITY_CASES,
    ...PASSWORD_CASES,
    ['the birth date is missing', { birthDate: undefined }, 'birthDate'],
    ['the birth date carries a time', { birthDate: '1990-05-12T00:00:00Z' }, 'birthDate'],
    ['the gender is JSON null', { gender: null }, 'gender'],
    ['the gender is outside the supported set', { gender: 'other' }, 'gender'],
    ['the account consent is missing', { accountConsent: undefined }, 'accountConsent'],
    ['the account consent is JSON null', { accountConsent: null }, 'accountConsent'],
    ['the account consent was not accepted', { accountConsent: { accepted: false, textVersion: '2026-10' } }, 'accepted'],
    ['the account consent flag is the string "true"', { accountConsent: { accepted: 'true', textVersion: '2026-10' } }, 'accepted'],
    ['the account consent has no text version', { accountConsent: { accepted: true } }, 'textVersion'],
    ['the account consent text version is empty', { accountConsent: { accepted: true, textVersion: '' } }, 'textVersion'],
    ['the account consent text version is longer than 64 characters', { accountConsent: { accepted: true, textVersion: 'v'.repeat(65) } }, 'textVersion'],
  ];

  it('should accept the body the registration form sends when gender is omitted', async () => {
    expect(await violationsOf(RegisterPatientDto, REGISTER)).toEqual([]);
  });

  it('should accept the optional gender when it is male or female', async () => {
    expect(await violationsOf(RegisterPatientDto, bodyOf(REGISTER, { gender: 'male' }))).toEqual(
      [],
    );
  });

  it.each(INVALID)('should reject the body when %s', async (_label, overrides, property) => {
    const violations = await violationsOf(RegisterPatientDto, bodyOf(REGISTER, overrides));

    expect(violations.join('; ')).toContain(property);
  });

  it('should strip roles and isActive so a self-registration cannot choose its privileges', async () => {
    const dto = await pipeline(
      RegisterPatientDto,
      bodyOf(REGISTER, { roles: ['ADMIN'], isActive: false }),
    );

    expect(dto).not.toHaveProperty('roles');
    expect(dto).not.toHaveProperty('isActive');
  });
});

describe('ListUsersQueryDto (GET /api/v1/admin/users)', () => {
  const rejects = (query: Body): Promise<ReadonlyArray<string>> =>
    violationsOf(ListUsersQueryDto, query, 'query');

  it('should accept an empty query because every filter is optional', async () => {
    expect(await rejects({})).toEqual([]);
  });

  it('should turn page and pageSize into numbers when the query carries them as text', async () => {
    const dto = await pipeline(
      ListUsersQueryDto,
      { role: 'DOCTOR', search: 'пет', page: '2', pageSize: '50' },
      'query',
    );

    expect(dto).toMatchObject({ role: 'DOCTOR', search: 'пет', page: 2, pageSize: 50 });
  });

  it.each([
    ['page is zero', { page: '0' }, 'page'],
    ['page is above the 1000 ceiling', { page: '1001' }, 'page'],
    ['page is not a number', { page: 'abc' }, 'page'],
    ['page is fractional', { page: '1.5' }, 'page'],
    ['pageSize is zero', { pageSize: '0' }, 'pageSize'],
    ['pageSize is above the contract maximum', { pageSize: '101' }, 'pageSize'],
    ['role is outside the enum', { role: 'NURSE' }, 'role'],
    ['role is empty', { role: '' }, 'role'],
    ['search is longer than 100 characters', { search: 'x'.repeat(101) }, 'search'],
  ])('should reject the query when %s', async (_label, query, property) => {
    expect((await rejects(query)).join('; ')).toContain(property);
  });
});
