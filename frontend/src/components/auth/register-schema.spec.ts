import { registerFormSchema, toRegisterRequest } from './register-schema';

const VALID = { email: 'ivan@example.by', firstName: 'Иван', lastName: 'Иванов', password: 'Str0ng!Pass', birthDate: '1990-05-12', gender: '' };

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
    const messages = messagesOf({ email: '', firstName: ' ', lastName: '', password: '', birthDate: '' });

    expect(messages).toMatchObject({
      email: 'validation.required',
      firstName: 'validation.required',
      lastName: 'validation.required',
      password: 'validation.required',
      birthDate: 'validation.required',
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
