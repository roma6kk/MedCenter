import { decodeJwtPayload } from './jwt';

function encodeSegment(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function makeToken(payload: Record<string, unknown>): string {
  return `${encodeSegment({ alg: 'RS256', typ: 'JWT' })}.${encodeSegment(payload)}.signature`;
}

describe('decodeJwtPayload', () => {
  it('should decode the SMART claim set when the token is well-formed', () => {
    const token = makeToken({ sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', patient: 'Patient/123' });

    expect(decodeJwtPayload(token)).toEqual(
      expect.objectContaining({ sub: 'u1', scope: 'patient/*.read', role: 'PATIENT', patient: 'Patient/123' }),
    );
  });

  it('should return null when the token does not have three segments', () => {
    expect(decodeJwtPayload('only.two')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });

  it.each([
    ['a.b.c', 'non-base64 payload'],
    [`${encodeSegment({ alg: 'RS256' })}.${Buffer.from('{not json', 'utf8').toString('base64url')}.sig`, 'invalid JSON payload'],
    [`${encodeSegment({ alg: 'RS256' })}..sig`, 'empty payload segment'],
  ])('should return null for a tampered token (%s)', (token) => {
    expect(decodeJwtPayload(token)).toBeNull();
  });

  it('should return null when the payload is a JSON primitive', () => {
    const token = `${encodeSegment({ alg: 'RS256' })}.${Buffer.from('42', 'utf8').toString('base64url')}.sig`;

    expect(decodeJwtPayload(token)).toBeNull();
  });
});
