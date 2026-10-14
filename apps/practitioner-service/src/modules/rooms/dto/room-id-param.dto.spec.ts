import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RoomIdParamDto } from './room-id-param.dto';

async function isValidId(id: string): Promise<boolean> {
  const errors = await validate(plainToInstance(RoomIdParamDto, { id }));
  return errors.length === 0;
}

describe('RoomIdParamDto', () => {
  it('should accept a FHIR id when it uses letters, digits, dashes and dots', async () => {
    expect(await isValidId('room-204.a')).toBe(true);
  });

  it('should reject the id when it would OR the actor search with a comma', async () => {
    expect(await isValidId('a,b')).toBe(false);
  });

  it.each(['.', '..'])('should reject the id when it is only dots (%s) and would collapse the FHIR URL', async (id) => {
    // `Location/..` resolves to the FHIR base URL inside fetch.
    expect(await isValidId(id)).toBe(false);
  });
});
