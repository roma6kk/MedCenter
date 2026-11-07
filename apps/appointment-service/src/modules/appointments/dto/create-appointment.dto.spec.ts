import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateAppointmentDto } from './create-appointment.dto';

const GENERATED_SLOT_ID = 'a3f1c9e07b2d4c5e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e';

async function invalidPropertiesOf(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateAppointmentDto, body));
  return errors.map((error) => error.property);
}

describe('CreateAppointmentDto', () => {
  it('should accept the slot when its id is the hex digest catalog-service generates', async () => {
    const body = { slotId: GENERATED_SLOT_ID };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid).toEqual([]);
  });

  it('should accept the slot and service when their ids are a UUID and a HAPI numeric id', async () => {
    const body = { slotId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', serviceId: '1001', reason: 'Болит спина' };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid).toEqual([]);
  });

  it('should reject the ids when they are not FHIR ids', async () => {
    const body = { slotId: 'Slot/abc', serviceId: 'a,b' };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid.sort()).toEqual(['serviceId', 'slotId']);
  });

  it('should reject the ids when they are dot-only', async () => {
    const body = { slotId: '..', serviceId: '.' };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid.sort()).toEqual(['serviceId', 'slotId']);
  });

  it('should reject the request when slotId is missing', async () => {
    const body = { reason: 'Болит спина' };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid).toEqual(['slotId']);
  });

  it('should reject the reason when it is shorter than 3 characters', async () => {
    const body = { slotId: GENERATED_SLOT_ID, reason: 'ok' };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid).toEqual(['reason']);
  });

  it('should reject the reason when it is only whitespace, so that no blank text is stored', async () => {
    const body = { slotId: GENERATED_SLOT_ID, reason: '     ' };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid).toEqual(['reason']);
  });

  it('should count the characters of the reason without the padding when it is shorter than 3', async () => {
    const body = { slotId: GENERATED_SLOT_ID, reason: '  ab  ' };

    const invalid = await invalidPropertiesOf(body);

    expect(invalid).toEqual(['reason']);
  });

  it('should keep the reason without its padding when the text around it is blank', () => {
    const body = { slotId: GENERATED_SLOT_ID, reason: '  Болит спина\n' };

    const dto = plainToInstance(CreateAppointmentDto, body);

    expect(dto.reason).toBe('Болит спина');
  });
});
