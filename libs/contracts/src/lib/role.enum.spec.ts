import { Role } from './role.enum';

describe('Role', () => {
  it('should expose exactly the three RBAC roles when the enum is read', () => {
    expect(Object.values(Role)).toEqual(['PATIENT', 'DOCTOR', 'ADMIN']);
  });

  it('should map every role key to its own string value', () => {
    expect(Role.PATIENT).toBe('PATIENT');
    expect(Role.DOCTOR).toBe('DOCTOR');
    expect(Role.ADMIN).toBe('ADMIN');
  });

  it('should have no numeric reverse mapping when the enum is string-valued', () => {
    expect(Object.keys(Role)).toEqual(['PATIENT', 'DOCTOR', 'ADMIN']);
  });
});
