import { ACCOUNT_CONSENT_VERSION } from '@/lib/contracts';
import { REGISTER_FIELDS, registerFormSchema, toRegisterRequest } from './register-schema';

const VALID = { email: 'ivan@example.by', firstName: 'Иван', lastName: 'Иванов', password: 'Str0ng!Pass', birthDate: '1990-05-12', gender: '', accountConsent: true };

function messagesOf(input: Record<string, unknown>): Readonly<Record<string, string>> {
  const result = registerFormSchema.safeParse(input);
  if (result.success) return {};
  // react-hook-form shows the first issue of a field, so the first one is what the user sees.
  return Object.fromEntries([...result.error.issues].reverse().map((issue) => [String(issue.path[0]), issue.message]));
}

describe('registerFormSchema', () => {
  it('should accept a valid registration when the gender is left unspecified', () => {
    const result = registerFormSchema.parse(VALID);

    expect(result.gender).toBe('');
    expect(result.email).toBe('ivan@example.by');
  });

  it('should accept the gender when it is male or female', () => {
    expect(registerFormSchema.parse({ ...VALID, gender: 'female' }).gender).toBe('female');
  });

  it('should ask for every required field with the required message when the form is empty', () => {
    const messages = messagesOf({ email: '', firstName: ' ', lastName: '', password: '', birthDate: '', accountConsent: false });

    expect(messages).toMatchObject({
      email: 'validation.required',
      firstName: 'validation.required',
      lastName: 'validation.required',
      password: 'validation.required',
      birthDate: 'validation.required',
      accountConsent: 'validation.consentRequired',
    });
  });

  it('should reject the email when it is malformed', () => {
    expect(messagesOf({ ...VALID, email: 'not-an-email' })['email']).toBe('validation.email');
  });

  it('should reject a password like the server does when it has no ASCII special character', () => {
    expect(messagesOf({ ...VALID, password: 'Пароль12345Aa' })['password']).toBe('validation.passwordStrength');
  });

  it('should reject a password when it is shorter than 10 characters', () => {
    expect(messagesOf({ ...VALID, password: 'Aa1!aaaa' })['password']).toBe('validation.passwordStrength');
  });

  it('should reject the date when it is not a real calendar day', () => {
    expect(messagesOf({ ...VALID, birthDate: '2020-13-45' })['birthDate']).toBe('validation.date');
  });

  it('should reject a name when it is longer than 100 characters', () => {
    expect(messagesOf({ ...VALID, firstName: 'я'.repeat(101) })['firstName']).toBe('validation.tooLong');
  });
});

describe('toRegisterRequest', () => {
  it('should leave the gender out when it is not specified', () => {
    expect(toRegisterRequest(registerFormSchema.parse(VALID))).not.toHaveProperty('gender');
  });

  it('should send the gender when one is chosen', () => {
    expect(toRegisterRequest(registerFormSchema.parse({ ...VALID, gender: 'male' })).gender).toBe('male');
  });
});

describe('account consent', () => {
  it('should refuse the registration when the box is not ticked', () => {
    expect(messagesOf({ ...VALID, accountConsent: false })['accountConsent']).toBe('validation.consentRequired');
  });

  it('should send the acceptance with the version of the text shown when the box is ticked', () => {
    expect(toRegisterRequest(registerFormSchema.parse(VALID)).accountConsent).toEqual({ accepted: true, textVersion: ACCOUNT_CONSENT_VERSION });
    expect(ACCOUNT_CONSENT_VERSION).toBe('2026-10');
  });

  it('should let server errors for the consent and its subfields land on the checkbox', () => {
    expect(REGISTER_FIELDS).toEqual(expect.arrayContaining(['accountConsent', 'accountConsent.accepted', 'accountConsent.textVersion']));
  });
});
