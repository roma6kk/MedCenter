import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { APPOINTMENT_CANCEL_REASON_CODES } from '@medcenter/contracts';
import { CancelAppointmentDto } from './cancel-appointment.dto';

async function invalidPropertiesOf(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CancelAppointmentDto, body));
  return errors.map((error) => error.property);
}

describe('CancelAppointmentDto', () => {
  it.each(APPOINTMENT_CANCEL_REASON_CODES)('should accept the code %s', async (reason) => {
    expect(await invalidPropertiesOf({ reason })).toEqual([]);
  });

  it.each([{}, { reason: 'Не смогу прийти' }, { reason: 'illness' }, { reason: 42 }, { reason: ' other ' }])(
    'should reject %p, so that no free text is stored',
    async (body) => {
      expect(await invalidPropertiesOf(body)).toEqual(['reason']);
    },
  );
});
