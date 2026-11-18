import type { JwtClaims } from '@medcenter/common';

import { assertRoleScope } from './scope-policy';

function errorCodeOf(act: () => unknown): unknown {
  try {
    act();
  } catch (error) {
    return ((error as { getResponse(): { errorCode?: unknown } }).getResponse()).errorCode;
  }
  return undefined;
}

const base: JwtClaims = { sub: 'u-1', scope: '', role: 'PATIENT', jti: 'j-1' };

describe('assertRoleScope', () => {
  it('should accept a patient read when the token has patient/*.read', () => {
    const claims: JwtClaims = { ...base, scope: 'patient/*.read launch' };

    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    expect(code).toBeUndefined();
  });

  it('should refuse a patient read with FORBIDDEN_SCOPE when the token only has user/*.read', () => {
    const claims: JwtClaims = { ...base, scope: 'user/*.read' };

    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    expect(code).toBe('FORBIDDEN_SCOPE');
  });

  it('should require user/*.write when an admin writes', () => {
    const readOnlyAdmin: JwtClaims = { ...base, role: 'ADMIN', scope: 'user/*.read' };
    const writingAdmin: JwtClaims = { ...base, role: 'ADMIN', scope: 'user/*.read user/*.write' };

    const codes = [readOnlyAdmin, writingAdmin].map((claims) => errorCodeOf(() => assertRoleScope(claims, 'write')));

    expect(codes).toEqual(['FORBIDDEN_SCOPE', undefined]);
  });

  it('should accept a doctor read when the token has user/*.read', () => {
    const claims: JwtClaims = { ...base, role: 'DOCTOR', scope: 'user/*.read' };

    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    expect(code).toBeUndefined();
  });

  it('should refuse with FORBIDDEN_ROLE when the role has no scope policy', () => {
    const claims: JwtClaims = { ...base, role: 'NURSE', scope: 'user/*.read' };

    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    expect(code).toBe('FORBIDDEN_ROLE');
  });
});
