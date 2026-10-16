import { decodeClaims } from './smoke-session';

function jwtWith(payload: object): string {
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

describe('decodeClaims', () => {
  it('should read the role, scope and identity claims of the payload', () => {
    const claims = decodeClaims(jwtWith({ sub: 'u-1', role: 'PATIENT', scope: 'launch patient/*.read', patient: '1439', fhirUser: 'Patient/1439' }));

    expect(claims).toMatchObject({ sub: 'u-1', role: 'PATIENT', patient: '1439', fhirUser: 'Patient/1439' });
  });

  it('should refuse a token that is not three dot-separated parts', () => {
    expect(() => decodeClaims('opaque')).toThrow('not a JWT');
  });

  it('should refuse a payload that is not a JSON object', () => {
    expect(() => decodeClaims(jwtWith([1, 2]))).not.toThrow();
    expect(() => decodeClaims(`a.${Buffer.from('null').toString('base64url')}.c`)).toThrow('not a JSON object');
  });
});
