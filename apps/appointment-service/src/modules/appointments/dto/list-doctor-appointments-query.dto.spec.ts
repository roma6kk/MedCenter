// `@Type()` (class-transformer) stores design metadata; Nest loads this polyfill in the running app.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListDoctorAppointmentsQueryDto } from './list-doctor-appointments-query.dto';

/** Names of the query parameters that failed validation. */
async function invalidPropertiesOf(query: Record<string, string>): Promise<string[]> {
  const errors = await validate(plainToInstance(ListDoctorAppointmentsQueryDto, query));
  return errors.map((error) => error.property).sort();
}

describe('ListDoctorAppointmentsQueryDto', () => {
  it('should accept the range when both bounds are RFC 3339 full dates', async () => {
    // Arrange
    const query = { from: '2026-11-02', to: '2026-11-02', page: '1' };

    // Act
    const invalid = await invalidPropertiesOf(query);

    // Assert
    expect(invalid).toEqual([]);
  });

  it('should accept the range when the bounds are RFC 3339 date-times with an offset', async () => {
    // Arrange
    const query = { from: '2026-11-02T08:00:00+03:00', to: '2026-11-02T20:00:00.000Z' };

    // Act
    const invalid = await invalidPropertiesOf(query);

    // Assert
    expect(invalid).toEqual([]);
  });

  it('should reject ISO 8601 forms FHIR search does not understand when a week or ordinal date is sent', async () => {
    // Arrange
    const query = { from: '2026-W45', to: '2026-306' };

    // Act
    const invalid = await invalidPropertiesOf(query);

    // Assert
    expect(invalid).toEqual(['from', 'to']);
  });

  it('should reject a date-time without a time zone or an impossible calendar date', async () => {
    // Arrange
    const query = { from: '2026-11-02T08:00:00', to: '2026-02-30' };

    // Act
    const invalid = await invalidPropertiesOf(query);

    // Assert
    expect(invalid).toEqual(['from', 'to']);
  });

  it('should reject the page size when it exceeds 100', async () => {
    // Arrange
    const query = { pageSize: '101' };

    // Act
    const invalid = await invalidPropertiesOf(query);

    // Assert
    expect(invalid).toEqual(['pageSize']);
  });
});
