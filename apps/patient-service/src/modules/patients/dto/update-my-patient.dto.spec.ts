import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateMyPatientDto } from './update-my-patient.dto';

async function check(body: unknown): Promise<{ errors: string[]; phone: unknown }> {
  const dto = plainToInstance(UpdateMyPatientDto, body);
  const errors = await validate(dto);
  return { errors: errors.map((e) => e.property), phone: dto.phone };
}

describe('UpdateMyPatientDto', () => {
  it('should normalise a phone written with spaces and dashes when the number is Belarusian', async () => {
    expect(await check({ phone: '+375 (29) 123-45-67' })).toEqual({ errors: [], phone: '+375291234567' });
  });

  it.each([{}, { phone: '' }, { phone: null }, { phone: 375291234567 }, { phone: '+7 912 345 67 89' }, { phone: '+37529123' }])(
    'should reject the body %j',
    async (body) => {
      expect((await check(body)).errors).toEqual(['phone']);
    },
  );
});
