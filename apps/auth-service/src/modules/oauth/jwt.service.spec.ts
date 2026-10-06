import { ACCESS_TOKEN_TTL_SECONDS, JwtService } from './jwt.service';
import { TEST_ISSUER, createTestKeys } from './__tests__/test-keys';

interface DecodedClaims {
  readonly sub?: string;
  readonly role?: string;
  readonly patient?: string;
  readonly iss?: string;
  readonly jti?: string;
  readonly iat?: number;
  readonly exp?: number;
}

interface DecodedHeader {
  readonly alg?: string;
  readonly typ?: string;
  readonly kid?: string;
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
}

function decodeJwt(token: string): DecodedClaims {
  return decodeJson<DecodedClaims>(token.split('.')[1] ?? '');
}

describe('JwtService', () => {
  const service = new JwtService(createTestKeys());

  it('should embed role and patientRef in the access token claims', () => {
    const token = service.signAccessToken({
      sub: 'u1',
      role: 'PATIENT',
      patientRef: 'Patient/9f2c',
      scope: 'patient/*.read',
    });

    const claims = decodeJwt(token);

    expect(claims.role).toBe('PATIENT');
    expect(claims.patient).toBe('Patient/9f2c');
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('should set the issuer and a unique jti for every token', () => {
    const first = decodeJwt(
      service.signAccessToken({ sub: 'u1', role: 'DOCTOR', scope: 'user/*.read' }),
    );
    const second = decodeJwt(
      service.signAccessToken({ sub: 'u1', role: 'DOCTOR', scope: 'user/*.read' }),
    );

    expect(first.iss).toBe(TEST_ISSUER);
    expect(first.sub).toBe('u1');
    expect(typeof first.jti).toBe('string');
    expect(first.jti).not.toBe(second.jti);
  });

  it('should omit patient when no patientRef is supplied', () => {
    const claims = decodeJwt(
      service.signAccessToken({ sub: 'u2', role: 'ADMIN', scope: 'user/*.read' }),
    );

    expect(claims).not.toHaveProperty('patient');
  });

  it('should emit a three-segment RS256 JWS with the kid in the header', () => {
    const token = service.signAccessToken({ sub: 'u1', role: 'PATIENT', scope: 'launch' });
    const [header, payload, signature] = token.split('.');

    expect(decodeJson<DecodedHeader>(header ?? '')).toEqual({
      alg: 'RS256',
      typ: 'JWT',
      kid: 'auth-test',
    });
    expect(payload).toBeDefined();
    expect((signature ?? '').length).toBeGreaterThan(0);
  });
});
