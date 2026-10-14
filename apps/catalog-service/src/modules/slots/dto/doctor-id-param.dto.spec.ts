import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DoctorIdParamDto } from './doctor-id-param.dto';

async function isValidId(id: string): Promise<boolean> {
  const errors = await validate(plainToInstance(DoctorIdParamDto, { id }));
  return errors.length === 0;
}

describe('DoctorIdParamDto', () => {
  it('should accept a FHIR id when it uses letters, digits, dashes and dots', async () => {
    expect(await isValidId('prac-1.v2')).toBe(true);
  });

  it('should reject the id when it would OR the reference search with a comma', async () => {
    expect(await isValidId('a,b')).toBe(false);
  });

  it.each(['.', '..'])('should reject the id when it is only dots (%s) and would collapse the FHIR URL', async (id) => {
    // `Practitioner/..` resolves to the FHIR base URL inside fetch.
    expect(await isValidId(id)).toBe(false);
  });

  it('should reject the id when it is longer than 64 characters', async () => {
    expect(await isValidId('a'.repeat(65))).toBe(false);
  });
});
