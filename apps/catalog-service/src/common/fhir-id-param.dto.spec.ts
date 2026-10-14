import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { FhirIdParamDto } from './fhir-id-param.dto';

async function isValidId(id: string): Promise<boolean> {
  const errors = await validate(plainToInstance(FhirIdParamDto, { id }));
  return errors.length === 0;
}

describe('FhirIdParamDto', () => {
  it('should accept a FHIR id when it uses letters, digits, dashes and dots', async () => {
    expect(await isValidId('svc-1.a')).toBe(true);
  });

  it('should accept a 64-character id when it is at the grammar limit', async () => {
    expect(await isValidId('a'.repeat(64))).toBe(true);
  });

  it.each(['a,b', 'a/b', 'a b', '', 'a'.repeat(65)])(
    'should reject %p when it is not a single FHIR id',
    async (id) => {
      expect(await isValidId(id)).toBe(false);
    },
  );

  it.each(['.', '..'])('should reject the id when it is only dots (%s) and would collapse the FHIR URL', async (id) => {
    expect(await isValidId(id)).toBe(false);
  });
});
