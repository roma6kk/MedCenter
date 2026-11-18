import { pipeline, violationsOf } from '../../../__tests__/validation-helper';
import { UpdateClinicDto } from './update-clinic.dto';

describe('UpdateClinicDto', () => {
  it('should accept a body with every field', async () => {
    const body = {
      name: 'Клиника',
      phone: '+375 29 123-45-67',
      email: 'info@clinic.by',
      address: 'г. Минск, ул. Мира, 1',
      hours: 'Пн–Пт 09:00–18:00',
    };

    expect(await violationsOf(UpdateClinicDto, body)).toEqual([]);
  });

  it('should accept an empty body so that a PATCH may change nothing', async () => {
    expect(await violationsOf(UpdateClinicDto, {})).toEqual([]);
  });

  it('should trim the text fields', async () => {
    expect(await pipeline(UpdateClinicDto, { name: '  Клиника  ' })).toMatchObject({ name: 'Клиника' });
  });

  it.each([
    ['a blank name', { name: '   ' }, 'name'],
    ['a name over 200 characters', { name: 'А'.repeat(201) }, 'name'],
    ['a name with a control character', { name: 'Клиника\u0000' }, 'name'],
    ['a phone without +375', { phone: '+7 495 123-45-67' }, 'phone'],
    ['a phone with eight digits', { phone: '+375 29 123-45-6' }, 'phone'],
    ['a phone with letters', { phone: '+375 29 123-45-6a' }, 'phone'],
    ['a malformed e-mail', { email: 'not-an-email' }, 'email'],
    ['an e-mail over 255 characters', { email: `${'a'.repeat(250)}@example.by` }, 'email'],
    ['a blank address', { address: '' }, 'address'],
    ['an address over 300 characters', { address: 'А'.repeat(301) }, 'address'],
    ['blank working hours', { hours: ' ' }, 'hours'],
    ['working hours that are JSON null', { hours: null }, 'hours'],
    ['working hours over 200 characters', { hours: 'А'.repeat(201) }, 'hours'],
  ])('should reject %s', async (_label, body, property) => {
    const violations = await violationsOf(UpdateClinicDto, body);

    expect(violations.some((message) => message.startsWith(property))).toBe(true);
  });
});
