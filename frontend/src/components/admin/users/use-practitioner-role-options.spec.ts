import type { Doctor } from '@/components/catalog/catalog-types';
import { practitionerRoleOptionsOf } from './use-practitioner-role-options';
import type { AdminUser } from './user-types';

function doctor(lastName: string, roleIds: ReadonlyArray<string>, specialty?: string): Doctor {
  return { id: lastName, firstName: 'Имя', lastName, name: `Имя ${lastName}`, practitionerRoleIds: roleIds, ...(specialty === undefined ? {} : { specialty }) };
}

function account(id: string, name: string, roleId: string | null): AdminUser {
  return { id, email: `${id}@x.test`, firstName: 'Имя', lastName: name, roles: ['DOCTOR'], patientRef: null, practitionerRoleRef: roleId === null ? null : `PractitionerRole/${roleId}`, isActive: true, name, role: 'DOCTOR' };
}

const takenBy = (name: string): string => `привязан к ${name}`;

describe('practitionerRoleOptionsOf', () => {
  it('should offer each role of each doctor sorted by surname, with the specialty in the label', () => {
    const options = practitionerRoleOptionsOf({ doctors: [doctor('Петров', ['r2'], 'Кардиолог'), doctor('Иванова', ['r1'], 'Терапевт')], accounts: [], userId: undefined, current: '', takenBy });

    expect(options).toEqual([
      { value: 'r1', label: 'Иванова Имя · Терапевт', disabled: false },
      { value: 'r2', label: 'Петров Имя · Кардиолог', disabled: false },
    ]);
  });

  it('should disable a role linked to another account and name that account', () => {
    const options = practitionerRoleOptionsOf({ doctors: [doctor('Петров', ['r2'])], accounts: [account('u9', 'Петров Алексей', 'r2')], userId: 'u1', current: '', takenBy });

    expect(options[0]).toEqual({ value: 'r2', label: 'Петров Имя — привязан к Петров Алексей', disabled: true });
  });

  it('should keep the edited account own role selectable', () => {
    const options = practitionerRoleOptionsOf({ doctors: [doctor('Петров', ['r2'])], accounts: [account('u1', 'Петров Алексей', 'r2')], userId: 'u1', current: 'r2', takenBy });

    expect(options).toEqual([{ value: 'r2', label: 'Петров Имя', disabled: false }]);
  });

  it('should tell two roles of one doctor apart by a short id', () => {
    const options = practitionerRoleOptionsOf({ doctors: [doctor('Петров', ['aaaaaaaa-1', 'bbbbbbbb-2'])], accounts: [], userId: undefined, current: '', takenBy });

    expect(options.map((option) => option.label)).toEqual(['Петров Имя (aaaaaaaa)', 'Петров Имя (bbbbbbbb)']);
  });

  it('should keep the current value on offer when the catalog does not list it', () => {
    const options = practitionerRoleOptionsOf({ doctors: [], accounts: [], userId: 'u1', current: 'gone-role', takenBy });

    expect(options).toEqual([{ value: 'gone-role', label: 'gone-role', disabled: false }]);
  });
});
