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

  it('should accept the status as one value, a comma list or a repeated parameter and the patient as a FHIR id', async () => {
    // Arrange
    const queries: Array<Record<string, string>> = [
      { status: 'booked', patient: '9f2c' },
      { status: 'booked,noshow' },
      { status: ' booked , noshow ', patient: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
    ];

    // Act
    const results = await Promise.all(queries.map((query) => invalidPropertiesOf(query)));

    // Assert
    expect(results).toEqual([[], [], []]);
  });

  it('should transform the status into a list without duplicates and blanks around the values', () => {
    // Arrange
    const query = { status: 'booked, noshow,booked' };

    // Act
    const dto = plainToInstance(ListDoctorAppointmentsQueryDto, query);

    // Assert
    expect(dto.status).toEqual(['booked', 'noshow']);
  });

  it('should reject an unknown status and a patient that is not a FHIR id', async () => {
    // Arrange
    const query = { status: 'booked,arrived', patient: 'Patient/9f2c' };

    // Act
    const invalid = await invalidPropertiesOf(query);

    // Assert
    expect(invalid).toEqual(['patient', 'status']);
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
