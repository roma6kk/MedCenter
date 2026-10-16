import type { DemoManifest, DemoUserRecord } from '../demo-seed/demo-manifest';
import { pickAccounts } from './smoke-accounts';

const ROLE_IVANOVA = 'role-ivanova';

function user(role: DemoUserRecord['role'], email: string, extra: Partial<DemoUserRecord> = {}): DemoUserRecord {
  return { role, email, password: `pw-${email}`, status: 'created', ...extra };
}

function manifestWith(accounts: DemoUserRecord[]): DemoManifest {
  return {
    users: { generatedAt: 'x', authBaseUrl: 'http://localhost:8081', accounts },
    practitionerRoles: [
      { key: 'ivanova', id: ROLE_IVANOVA, practitionerId: 'doc-ivanova', specialty: { system: 's', code: 'c', display: 'd' }, healthcareServiceIds: [], roomIds: [] },
    ],
  };
}

const FULL: DemoUserRecord[] = [
  { role: 'ADMIN', email: 'boot@x.test', status: 'exists' },
  user('ADMIN', 'admin.demo@x.test'),
  user('DOCTOR', 'doctor.ivanova@x.test', { practitionerRoleId: ROLE_IVANOVA }),
  user('DOCTOR', 'doctor.petrov@x.test', { practitionerRoleId: 'role-petrov' }),
  user('PATIENT', 'p1@x.test'),
  user('PATIENT', 'p2@x.test'),
  user('PATIENT', 'p3@x.test'),
];

describe('pickAccounts', () => {
  it('should skip the bootstrap admin because the manifest holds no password for it', () => {
    expect(pickAccounts(manifestWith(FULL)).admin.email).toBe('admin.demo@x.test');
  });

  it('should pick the first demo doctor and resolve its Practitioner id from the manifest roles', () => {
    const accounts = pickAccounts(manifestWith(FULL));

    expect([accounts.doctor.email, accounts.doctorRoleId, accounts.doctorId]).toEqual(['doctor.ivanova@x.test', ROLE_IVANOVA, 'doc-ivanova']);
    expect(accounts.otherDoctor.email).toBe('doctor.petrov@x.test');
  });

  it('should pick three distinct patients', () => {
    const accounts = pickAccounts(manifestWith(FULL));

    expect(new Set([accounts.patient.email, accounts.otherPatient.email, accounts.thirdPatient.email]).size).toBe(3);
  });

  it('should ignore a failed account even when it kept a password', () => {
    const records = FULL.map((record) => (record.email === 'p3@x.test' ? { ...record, status: 'failed' as const } : record));

    expect(() => pickAccounts(manifestWith(records))).toThrow(/PATIENT account #3/);
  });

  it('should name the --with-admin opt-in when the manifest has no demo admin with a password', () => {
    const records = FULL.filter((record) => record.email !== 'admin.demo@x.test');

    expect(() => pickAccounts(manifestWith(records))).toThrow('npm run seed:demo -- --users --with-admin');
  });

  it('should say which seed step to run when the users section is missing', () => {
    expect(() => pickAccounts({})).toThrow('npm run seed:demo -- --users');
  });

  it('should say which seed step to run when the doctor role is not in the FHIR part of the manifest', () => {
    const manifest: DemoManifest = { users: manifestWith(FULL).users };

    expect(() => pickAccounts(manifest)).toThrow('npm run seed:demo');
  });

  it('should never put a password into an error message', () => {
    let message = '';
    try {
      pickAccounts(manifestWith(FULL.filter((record) => record.role !== 'PATIENT')));
    } catch (error: unknown) {
      message = String(error);
    }

    expect(message).toContain('PATIENT');
    expect(message).not.toContain('pw-');
  });
});
