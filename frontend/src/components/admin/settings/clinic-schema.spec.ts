import { clinicSchema } from './clinic-schema';

const VALID = { name: 'Клиника', phone: '+375 29 123-45-67', email: 'info@clinic.by', address: 'г. Минск, ул. Мира, 1', hours: 'Пн–Пт 09:00–18:00' };

function messageOf(overrides: Record<string, string>): string | undefined {
  const result = clinicSchema.safeParse({ ...VALID, ...overrides });
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('clinicSchema', () => {
  it('should accept the details of the clinic', () => {
    expect(clinicSchema.safeParse(VALID).success).toBe(true);
  });

  it.each([
    ['an empty name', { name: ' ' }, 'validation.required'],
    ['a phone that is not Belarusian', { phone: '+7 495 123-45-67' }, 'validation.phone'],
    ['a malformed e-mail', { email: 'info@' }, 'validation.email'],
    ['an empty address', { address: '' }, 'validation.required'],
    ['empty working hours', { hours: '' }, 'validation.required'],
    ['working hours over 200 characters', { hours: 'a'.repeat(201) }, 'validation.tooLong'],
  ])('should reject %s', (_label, overrides, message) => {
    expect(messageOf(overrides)).toBe(message);
  });
});
