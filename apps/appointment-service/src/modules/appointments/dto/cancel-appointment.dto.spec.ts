import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CancelAppointmentDto } from './cancel-appointment.dto';

/** The transformed DTO and the names of the properties that failed validation. */
async function checked(body: Record<string, unknown>): Promise<{ dto: CancelAppointmentDto; invalid: string[] }> {
  const dto = plainToInstance(CancelAppointmentDto, body);
  const errors = await validate(dto);
  return { dto, invalid: errors.map((error) => error.property) };
}

describe('CancelAppointmentDto', () => {
  it('should accept a reason of 3 to 500 characters', async () => {
    // Act
    const results = await Promise.all([checked({ reason: 'Не смогу прийти' }), checked({ reason: 'abc' }), checked({ reason: 'x'.repeat(500) })]);

    // Assert
    expect(results.map((result) => result.invalid)).toEqual([[], [], []]);
  });

  it('should reject the reason when it is only whitespace, so that no empty reason is stored', async () => {
    // Act
    const { invalid } = await checked({ reason: '     ' });

    // Assert
    expect(invalid).toEqual(['reason']);
  });

  it('should count the characters of the reason without the padding when it is shorter than 3', async () => {
    // Act
    const { invalid } = await checked({ reason: '  ab  ' });

    // Assert
    expect(invalid).toEqual(['reason']);
  });

  it('should keep the reason without its padding when it is accepted', async () => {
    // Act
    const { dto, invalid } = await checked({ reason: '  Не смогу прийти \n' });

    // Assert
    expect(invalid).toEqual([]);
    expect(dto.reason).toBe('Не смогу прийти');
  });

  it('should reject the reason when it is missing, not a string, or longer than 500 characters', async () => {
    // Act
    const results = await Promise.all([checked({}), checked({ reason: 42 }), checked({ reason: 'x'.repeat(501) })]);

    // Assert
    expect(results.map((result) => result.invalid)).toEqual([['reason'], ['reason'], ['reason']]);
  });
});
