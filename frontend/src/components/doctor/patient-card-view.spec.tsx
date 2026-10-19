jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

// Long typing sequences (hundreds of keystrokes through user-event) take well over 5 s when the machine is busy.
jest.setTimeout(30_000);

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { callsTo, pageOf, problem, renderWithClient, routeApi, type ApiMock, type ApiRoute } from './doctor-test-utils';
import { PatientCardView } from './patient-card-view';

const apiFetchMock = apiFetch as ApiMock;

const PATIENT = {
  id: 'p1',
  active: true,
  fullName: 'Кузнецов Алексей Иванович',
  lastName: 'Кузнецов',
  firstName: 'Алексей',
  middleName: 'Иванович',
  birthDate: '1978-07-21',
  gender: 'male',
  telecom: [{ system: 'phone', value: '+375 29 111-22-33' }, { system: 'email', value: 'kuznetsov@medcenter.test' }],
};

const RELATED = { id: 'r1', patientId: 'p1', active: true, fullName: 'Кузнецова Мария', relationship: [{ system: 's', code: 'WIFE', display: 'Супруга' }], telecom: [{ system: 'phone', value: '+375 29 555-66-77' }] };

const HISTORY = {
  id: 'enc-9',
  date: '2026-10-14T06:00:00Z',
  status: 'finished',
  diagnosis: 'J06.9',
  diagnoses: [{ code: 'J06.9', display: 'Острый назофарингит' }],
  summary: 'ОРВИ',
  recommendations: 'Покой',
  appointmentId: 'appt-9',
  practitionerRoleId: 'role-1',
};

const MEDICATION = { id: 'm1', kind: 'medication', status: 'active', atcCode: 'J01FA10', atcDisplay: 'Азитромицин', dosageText: '1 таб 3 раза в день', encounterId: 'enc-9', authoredOn: '2026-10-14T06:20:00Z' };
const SERVICE = { id: 's1', kind: 'service', status: 'active', codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: 'A01.001', display: 'Консультация кардиолога', encounterId: 'enc-9' };

function defaultRoutes(): ReadonlyArray<ApiRoute> {
  return [
    { path: '/api/v1/patients/p1/related', respond: () => pageOf([RELATED]) },
    { path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY]) },
    { path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([MEDICATION, SERVICE]) },
    { path: '/api/v1/patients/p1', respond: () => PATIENT },
  ];
}

function setup(overrides: ReadonlyArray<ApiRoute> = []): void {
  apiFetchMock.mockReset();
  routeApi(apiFetchMock, [...overrides, ...defaultRoutes()]);
  renderWithClient(<PatientCardView patientId="p1" />);
}

describe('PatientCardView header (API 3.2)', () => {
  it('should show the full name, birth date with age and the sex of the patient', async () => {
    setup();

    expect(await screen.findByRole('heading', { level: 1, name: 'Кузнецов Алексей Иванович' })).toBeInTheDocument();
    expect(screen.getByText(/21 июля 1978/)).toBeInTheDocument();
    expect(screen.getByText('Мужской')).toBeInTheDocument();
  });

  it('should make the phone and the e-mail clickable contacts', async () => {
    setup();

    const header = within(await screen.findByRole('region', { name: 'Кузнецов Алексей Иванович' }));

    expect(header.getByRole('link', { name: '+375 29 111-22-33' })).toHaveAttribute('href', 'tel:+375291112233');
    expect(header.getByRole('link', { name: 'kuznetsov@medcenter.test' })).toHaveAttribute('href', 'mailto:kuznetsov@medcenter.test');
  });

  it('should mark the card as inactive when the patient is not active', async () => {
    setup([{ path: '/api/v1/patients/p1', respond: () => ({ ...PATIENT, active: false }) }]);

    expect(await screen.findByText('Неактивна')).toBeInTheDocument();
  });

  it('should show one not-found state and no sections when the patient is outside the doctor compartment', async () => {
    setup([{ path: '/api/v1/patients/p1', respond: () => { throw problem(403, 'COMPARTMENT_VIOLATION'); } }]);

    expect(await screen.findByText('Пациент не найден')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'История обращений' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Назначения' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Доверенные лица' })).toBeNull();
  });

  it('should keep the sections when the card fails with a server error that a retry may fix', async () => {
    setup([{ path: '/api/v1/patients/p1', respond: () => { throw problem(500, 'INTERNAL'); } }]);

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'История обращений' })).toBeInTheDocument();
  });

  it('should show "not specified" when the birth date and contacts are missing', async () => {
    setup([{ path: '/api/v1/patients/p1', respond: () => ({ ...PATIENT, birthDate: undefined, gender: undefined, telecom: [] }) }]);

    expect(await screen.findByText('Контакты не указаны')).toBeInTheDocument();
  });
});

describe('PatientCardView trusted persons (API 3.3)', () => {
  it('should list the trusted person with the relationship and the contact', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'Доверенные лица' }));

    expect(await section.findByText('Кузнецова Мария')).toBeInTheDocument();
    expect(section.getByText('Супруга')).toBeInTheDocument();
    expect(section.getByRole('link', { name: '+375 29 555-66-77' })).toBeInTheDocument();
  });

  it('should say there are none when the list is empty', async () => {
    setup([{ path: '/api/v1/patients/p1/related', respond: () => pageOf([]) }]);

    expect(await screen.findByText('Доверенных лиц нет')).toBeInTheDocument();
  });

  it('should keep the rest of the card when the trusted persons cannot be loaded', async () => {
    setup([{ path: '/api/v1/patients/p1/related', respond: () => { throw problem(500, 'INTERNAL'); } }]);

    expect(await screen.findByRole('heading', { level: 1, name: 'Кузнецов Алексей Иванович' })).toBeInTheDocument();
    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(await screen.findByText('Острый назофарингит')).toBeInTheDocument();
  });
});

describe('PatientCardView history (API 7.4)', () => {
  it('should show the finished visit with the diagnosis chip and a link to its record', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'История обращений' }));

    expect(await section.findByText('Острый назофарингит')).toBeInTheDocument();
    expect(section.getByRole('link', { name: /^Открыть приём/ })).toHaveAttribute('href', '/encounters/enc-9');
  });

  it('should tell the links of different visits apart by the date of the visit', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'История обращений' }));

    expect(await section.findByRole('link', { name: /^Открыть приём от 14 окт\. 2026/ })).toBeInTheDocument();
  });

  it('should say there are no visits when the history is empty', async () => {
    setup([{ path: '/api/v1/patients/p1/history', respond: () => pageOf([]) }]);

    expect(await screen.findByText('Завершённых приёмов пока нет')).toBeInTheDocument();
  });

  it('should request the next page when the pager is used', async () => {
    setup([{ path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY], 1, 2) }]);
    const section = within(await screen.findByRole('region', { name: 'История обращений' }));
    await section.findByText('Острый назофарингит');

    await userEvent.click(section.getByRole('button', { name: 'Следующая страница' }));

    await screen.findByText('Острый назофарингит');
    expect(callsTo(apiFetchMock, '/api/v1/patients/p1/history').some(([path]) => path.includes('page=2'))).toBe(true);
  });
});

describe('PatientCardView prescriptions (API 7.5)', () => {
  it('should show a drug by its ATC code and a service by its own code, told apart by kind', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'Назначения' }));

    expect(await section.findByText('J01FA10')).toBeInTheDocument();
    expect(section.getByText('Азитромицин')).toBeInTheDocument();
    expect(section.getByText('1 таб 3 раза в день')).toBeInTheDocument();
    expect(section.getByText('A01.001')).toBeInTheDocument();
    expect(section.getByText('Консультация кардиолога')).toBeInTheDocument();
  });

  it('should not render an empty ATC chip for a service request', async () => {
    setup([{ path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([SERVICE]) }]);

    const section = within(await screen.findByRole('region', { name: 'Назначения' }));
    await section.findByText('Консультация кардиолога');

    expect(section.getAllByTestId('code-chip')).toHaveLength(1);
    expect(section.getByText('Услуга')).toBeInTheDocument();
  });

  it('should name the order in the link back to its encounter so the links of a list are distinguishable', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'Назначения' }));

    expect(await section.findByRole('link', { name: 'Открыть приём с назначением: Азитромицин' })).toHaveAttribute('href', '/encounters/enc-9');
    expect(section.getByRole('link', { name: 'Открыть приём с назначением: Консультация кардиолога' })).toBeInTheDocument();
  });

  it('should say there are no prescriptions when the list is empty', async () => {
    setup([{ path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([]) }]);

    expect(await screen.findByText('Назначений нет')).toBeInTheDocument();
  });
});
