import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateConsentDto } from './create-consent.dto';
import { RevokeConsentDto } from './revoke-consent.dto';

const BASE = { formNumber: 'F-1', scanId: 'bin-1', consenterType: 'self' };

async function signedAtErrors(signedAt: string): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateConsentDto, { ...BASE, signedAt }));
  return errors.filter((error) => error.property === 'signedAt').map((error) => error.property);
}

async function revokedAtErrors(revokedAt: string): Promise<string[]> {
  const errors = await validate(plainToInstance(RevokeConsentDto, { applicationNumber: 'A-1', revokedAt }));
  return errors.filter((error) => error.property === 'revokedAt').map((error) => error.property);
}

describe('consent date fields', () => {
  it.each(['2026-10-01', '2026-10-01T10:00:00+03:00', '2026-10-01T07:00:00Z'])('should accept %s', async (value) => {
    expect(await signedAtErrors(value)).toEqual([]);
    expect(await revokedAtErrors(value)).toEqual([]);
  });

  it.each(['2026-W40-3', '2026-274', '20261001', '2026-10-01T10:00:00', '2026-10-01 10:00:00', '2026-02-31'])(
    'should refuse %s as a client error instead of letting HAPI answer 500',
    async (value) => {
      expect(await signedAtErrors(value)).toEqual(['signedAt']);
      expect(await revokedAtErrors(value)).toEqual(['revokedAt']);
    },
  );
});
