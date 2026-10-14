import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateAppointmentDto } from './create-appointment.dto';

/** catalog-service ids a generated slot by a SHA-256 digest of (schedule, start), truncated to 64 hex chars. */
const GENERATED_SLOT_ID = 'a3f1c9e07b2d4c5e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e';

/** Names of the properties that failed validation. */
async function invalidPropertiesOf(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateAppointmentDto, body));
  return errors.map((error) => error.property);
}

describe('CreateAppointmentDto', () => {
  it('should accept the slot when its id is the hex digest catalog-service generates', async () => {
    // Arrange
    const body = { slotId: GENERATED_SLOT_ID };

    // Act
    const invalid = await invalidPropertiesOf(body);

    // Assert
    expect(invalid).toEqual([]);
  });

  it('should accept the slot and service when their ids are a UUID and a HAPI numeric id', async () => {
    // Arrange
    const body = { slotId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', serviceId: '1001', reason: 'Болит спина' };

    // Act
    const invalid = await invalidPropertiesOf(body);

    // Assert
    expect(invalid).toEqual([]);
  });

  it('should reject the ids when they are not FHIR ids', async () => {
    // Arrange
    const body = { slotId: 'Slot/abc', serviceId: 'a,b' };

    // Act
    const invalid = await invalidPropertiesOf(body);

    // Assert
    expect(invalid.sort()).toEqual(['serviceId', 'slotId']);
  });

  it('should reject the ids when they are dot-only', async () => {
    // Arrange
    const body = { slotId: '..', serviceId: '.' };

    // Act
    const invalid = await invalidPropertiesOf(body);

    // Assert
    expect(invalid.sort()).toEqual(['serviceId', 'slotId']);
  });

  it('should reject the request when slotId is missing', async () => {
    // Arrange
    const body = { reason: 'Болит спина' };

    // Act
    const invalid = await invalidPropertiesOf(body);

    // Assert
    expect(invalid).toEqual(['slotId']);
  });

  it('should reject the reason when it is shorter than 3 characters', async () => {
    // Arrange
    const body = { slotId: GENERATED_SLOT_ID, reason: 'ok' };

    // Act
    const invalid = await invalidPropertiesOf(body);

    // Assert
    expect(invalid).toEqual(['reason']);
  });
});
