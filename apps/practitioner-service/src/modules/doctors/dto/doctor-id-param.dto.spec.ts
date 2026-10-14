import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DoctorIdParamDto } from './doctor-id-param.dto';

async function isValidId(id: string): Promise<boolean> {
  const errors = await validate(plainToInstance(DoctorIdParamDto, { id }));
  return errors.length === 0;
}

describe('DoctorIdParamDto', () => {
  it('should accept a FHIR id when it is a UUID', async () => {
    expect(await isValidId('6ef5270b-6282-5a43-87f9-26d2d8b0c4f7')).toBe(true);
  });

  it.each(['a,b', '..', '.', 'a'.repeat(65), 'a b'])('should reject the id %s when it is not a FHIR id', async (id) => {
    expect(await isValidId(id)).toBe(false);
  });
});
