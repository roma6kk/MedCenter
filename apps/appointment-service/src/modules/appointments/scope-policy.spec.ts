import type { JwtClaims } from '@medcenter/common';

import { assertRoleScope } from './scope-policy';

/** `errorCode` of the exception a call throws, or `undefined` when it does not throw. */
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
    // Arrange
    const claims: JwtClaims = { ...base, scope: 'patient/*.read launch' };

    // Act
    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    // Assert
    expect(code).toBeUndefined();
  });

  it('should refuse a patient read with FORBIDDEN_SCOPE when the token only has user/*.read', () => {
    // Arrange
    const claims: JwtClaims = { ...base, scope: 'user/*.read' };

    // Act
    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    // Assert
    expect(code).toBe('FORBIDDEN_SCOPE');
  });

  it('should require user/*.write when an admin writes', () => {
    // Arrange
    const readOnlyAdmin: JwtClaims = { ...base, role: 'ADMIN', scope: 'user/*.read' };
    const writingAdmin: JwtClaims = { ...base, role: 'ADMIN', scope: 'user/*.read user/*.write' };

    // Act
    const codes = [readOnlyAdmin, writingAdmin].map((claims) => errorCodeOf(() => assertRoleScope(claims, 'write')));

    // Assert
    expect(codes).toEqual(['FORBIDDEN_SCOPE', undefined]);
  });

  it('should accept a doctor read when the token has user/*.read', () => {
    // Arrange
    const claims: JwtClaims = { ...base, role: 'DOCTOR', scope: 'user/*.read' };

    // Act
    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    // Assert
    expect(code).toBeUndefined();
  });

  it('should refuse with FORBIDDEN_ROLE when the role has no scope policy', () => {
    // Arrange
    const claims: JwtClaims = { ...base, role: 'NURSE', scope: 'user/*.read' };

    // Act
    const code = errorCodeOf(() => assertRoleScope(claims, 'read'));

    // Assert
    expect(code).toBe('FORBIDDEN_ROLE');
  });
});
