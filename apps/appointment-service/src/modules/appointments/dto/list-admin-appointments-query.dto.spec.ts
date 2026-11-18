import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListAdminAppointmentsQueryDto } from './list-admin-appointments-query.dto';

async function invalidPropertiesOf(query: Record<string, string>): Promise<string[]> {
  const errors = await validate(plainToInstance(ListAdminAppointmentsQueryDto, query));
  return errors.map((error) => error.property).sort();
}

describe('ListAdminAppointmentsQueryDto', () => {
  it('should accept the date range, a doctor role id and a status list', async () => {
    const query = { from: '2026-11-02', to: '2026-11-09', practitionerRoleId: 'role-1', status: 'booked,noshow', page: '2' };

    expect(await invalidPropertiesOf(query)).toEqual([]);
  });

  it('should reject a malformed date, an unknown status and a practitionerRoleId that is not a FHIR id', async () => {
    const query = { from: '2026-02-30', status: 'done', practitionerRoleId: 'PractitionerRole/1' };

    expect(await invalidPropertiesOf(query)).toEqual(['from', 'practitionerRoleId', 'status']);
  });
});
