import { appointmentFixture } from '@/components/appointments/appointment-fixtures';
import { ACTIVE_RECORD } from '@/components/consent/consent-fixtures';
import { accountFixture, historyFixture, medicationFixture, patientProfileFixture } from '@/components/patient/cabinet-fixtures';
import { POLICY_VERSION } from '@/lib/policy-version';
import { buildMyDataExport, myDataFileName, type MyDataSources } from './build-my-data-export';

const NOW = new Date('2026-11-15T10:30:00.000Z');
const CLINIC = { name: 'ООО «Лайфлайн»', phone: '+375 17 000-00-00', email: 'info@lifeline.example', address: 'г. Минск, ул. Здоровья, 12', hours: 'Пн–Пт 08:00–20:00' };

function sources(overrides: Partial<MyDataSources> = {}): MyDataSources {
  return {
    account: accountFixture({ accountConsent: { at: '2026-10-01T08:00:00.000Z', version: '2026-10' } }),
    patient: patientProfileFixture(),
    consent: { active: ACTIVE_RECORD, history: [ACTIVE_RECORD] },
    appointments: [appointmentFixture()],
    encounters: [historyFixture()],
    prescriptions: [medicationFixture()],
    ...overrides,
  };
}

describe('myDataFileName', () => {
  it('should name the file after the clinic day of the moment', () => {
    expect(myDataFileName(NOW)).toBe('medcenter-my-data-2026-11-15.json');
  });

  it('should use the clinic day and not the UTC day just before midnight in Minsk', () => {
    expect(myDataFileName(new Date('2026-11-15T22:30:00.000Z'))).toBe('medcenter-my-data-2026-11-16.json');
  });
});

describe('buildMyDataExport', () => {
  it('should carry everything the patient already reads through the existing APIs', () => {
    const data = sources();

    const result = buildMyDataExport(data, 'ru', NOW, CLINIC);

    expect(result.generatedAt).toBe('2026-11-15T10:30:00.000Z');
    expect(result.account).toMatchObject({ id: data.account.id, email: data.account.email });
    expect(result.patient).toEqual(data.patient);
    expect(result.consent).toEqual(data.consent);
    expect(result.appointments).toEqual(data.appointments);
    expect(result.encounters).toEqual(data.encounters);
    expect(result.prescriptions).toEqual(data.prescriptions);
  });

  it('should state the operator, the purposes with their bases, the consent moment and text version, retention, authorised persons and the written application', () => {
    const { information } = buildMyDataExport(sources(), 'ru', NOW, CLINIC);

    expect(information.operator).toMatchObject({ name: 'ООО «Лайфлайн»', address: 'г. Минск, ул. Здоровья, 12' });
    expect(information.operator.note).toMatch(/вымышлен/);
    expect(information.purposes).toHaveLength(4);
    expect(information.purposes[0]).toEqual({ title: 'Личный кабинет на портале', data: expect.stringContaining('Email'), legalBasis: expect.stringContaining('ст. 5') });
    expect(information.consent).toEqual({ accountConsentAt: '2026-10-01T08:00:00.000Z', accountConsentTextVersion: '2026-10', currentPolicyVersion: POLICY_VERSION });
    expect(information.retention).toMatch(/по номенклатуре дел оператора/);
    expect(information.authorisedPersons).toMatch(/не назначены/);
    expect(information.fullInformation).toMatch(/ст\. 14.*5 рабочих дней/);
    expect(information.legalBasis).toMatch(/п\. 1 ст\. 11/);
  });

  it('should leave the consent moment and version empty when the account has no recorded consent', () => {
    const { information } = buildMyDataExport(sources({ account: accountFixture({ accountConsent: null }) }), 'ru', NOW, CLINIC);

    expect(information.consent).toEqual({ accountConsentAt: null, accountConsentTextVersion: null, currentPolicyVersion: POLICY_VERSION });
  });

  it('should write the information in English when the interface is English', () => {
    const { information } = buildMyDataExport(sources(), 'en', NOW, CLINIC);

    expect(information.operator.note).toMatch(/fictitious|placeholder|demonstration/i);
    expect(information.retention).toMatch(/records schedule/);
    expect(information.fullInformation).toMatch(/5 working days/);
  });

  it('should write the operator contacts the clinic details give, not fixed text', () => {
    const { information } = buildMyDataExport(sources(), 'ru', NOW, { ...CLINIC, name: 'Клиника N', phone: '+375 29 111-22-33', address: 'г. Гомель' });

    expect(information.operator).toMatchObject({ name: 'Клиника N', phone: '+375 29 111-22-33', address: 'г. Гомель' });
  });

  it('should never write the session or any token', () => {
    const text = JSON.stringify(buildMyDataExport(sources(), 'ru', NOW, CLINIC));

    expect(text).not.toMatch(/token|password|passwordHash/i);
  });
});
