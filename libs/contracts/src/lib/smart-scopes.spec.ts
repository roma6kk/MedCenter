import { SMART_SCOPES, type SmartScope } from './smart-scopes';

describe('SMART_SCOPES', () => {
  it('should declare exactly the five platform scopes when the catalogue is read', () => {
    expect(SMART_SCOPES).toEqual({
      PATIENT_READ: 'patient/*.read',
      PATIENT_WRITE: 'patient/*.write',
      USER_READ: 'user/*.read',
      USER_WRITE: 'user/*.write',
      LAUNCH: 'launch',
    });
  });

  it('should express every resource scope in the SMART resource/* verb form', () => {
    const resourceScopes = [
      SMART_SCOPES.PATIENT_READ,
      SMART_SCOPES.PATIENT_WRITE,
      SMART_SCOPES.USER_READ,
      SMART_SCOPES.USER_WRITE,
    ];

    expect(resourceScopes.every((scope) => /^(patient|user)\/\*\.(read|write)$/.test(scope))).toBe(
      true,
    );
  });

  it('should keep the launch scope free of a resource wildcard', () => {
    expect(SMART_SCOPES.LAUNCH).toBe('launch');
  });

  it('should type every catalogue value as a SmartScope literal', () => {
    const scopes: ReadonlyArray<SmartScope> = Object.values(SMART_SCOPES);

    expect(scopes).toHaveLength(5);
  });
});
