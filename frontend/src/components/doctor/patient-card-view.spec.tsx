jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

jest.setTimeout(30_000);

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { appointment, callsTo, encounter, FINISHED_CONTENT, pageOf, problem, renderWithClient, routeApi, type ApiMock, type ApiRoute } from './doctor-test-utils';
import { ACTIVE_RECORD } from '@/components/consent/consent-fixtures';
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

const OLDER = { ...HISTORY, id: 'enc-5', date: '2026-09-01T06:00:00Z', summary: 'Контроль', appointmentId: 'appt-5' };
const MEDICATION = { id: 'm1', kind: 'medication', status: 'active', atcCode: 'J01FA10', atcDisplay: 'Азитромицин', dosageText: '1 таб 3 раза в день', encounterId: 'enc-9', authoredOn: '2026-10-14T06:20:00Z' };
const SERVICE = { id: 's1', kind: 'service', status: 'active', codeSystem: 'https://fhir.by/CodeSystem/nsi-services', code: 'A01.001', display: 'Консультация кардиолога', encounterId: 'enc-9' };

function defaultRoutes(): ReadonlyArray<ApiRoute> {
  return [
    { path: '/api/v1/patients/p1/consent', respond: () => ({ active: ACTIVE_RECORD, history: [ACTIVE_RECORD] }) },
    { path: '/api/v1/patients/p1/related', respond: () => pageOf([RELATED]) },
    { path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY]) },
    { path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([MEDICATION, SERVICE]) },
    { path: '/api/v1/encounters/enc-9', respond: () => encounter({ ...FINISHED_CONTENT, id: 'enc-9' }) },
    { path: '/api/v1/doctor/appointments', respond: () => pageOf([]) },
    { path: '/api/v1/patients/p1', respond: () => PATIENT },
  ];
}

function setup(overrides: ReadonlyArray<ApiRoute> = []): void {
  apiFetchMock.mockReset();
  routeApi(apiFetchMock, [...overrides, ...defaultRoutes()]);
  renderWithClient(<PatientCardView patientId="p1" />);
}

describe('PatientCardView loading (NFR-008, WCAG 4.1.3)', () => {
  const NEVER = (): Promise<never> => new Promise<never>(() => undefined);

  it('should announce the loading once while the header, the visits and the orders load side by side', () => {
    setup([
      { path: '/api/v1/patients/p1', respond: NEVER },
      { path: '/api/v1/patients/p1/history', respond: NEVER },
      { path: '/api/v1/patients/p1/prescriptions', respond: NEVER },
    ]);

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getAllByText('Загрузка…')).toHaveLength(1);
  });
});

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

describe('PatientCardView header lines (A1, A15)', () => {
  it('should not show the internal record id', async () => {
    setup();

    await screen.findByRole('heading', { level: 1, name: 'Кузнецов Алексей Иванович' });

    expect(screen.queryByText('Идентификатор')).not.toBeInTheDocument();
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
  });

  it('should say where the consent stands in one badge of the header', async () => {
    setup();

    const header = within(await screen.findByRole('region', { name: 'Кузнецов Алексей Иванович' }));

    expect(await header.findByTestId('consent-line-active')).toHaveTextContent('Согласие на ведение записей в ИС клиники · действует с 20.10.2026');
  });
});

describe('PatientCardView trusted persons (API 3.3, A15)', () => {
  it('should list the trusted person in a line of the header with the relationship and the phone', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'Доверенные лица' }));

    expect(await section.findByText('Кузнецова Мария')).toBeInTheDocument();
    expect(section.getByText('(Супруга)')).toBeInTheDocument();
    expect(section.getByRole('link', { name: '+375 29 555-66-77' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Кузнецов Алексей Иванович' })).getByRole('region', { name: 'Доверенные лица' })).toBe(section.getByRole('heading', { name: 'Доверенные лица' }).closest('section'));
  });

  it('should show nothing at all when there are none', async () => {
    setup([{ path: '/api/v1/patients/p1/related', respond: () => pageOf([]) }]);
    await screen.findByTestId('consent-line-active');

    expect(screen.queryByRole('region', { name: 'Доверенные лица' })).not.toBeInTheDocument();
    expect(screen.queryByText('Доверенных лиц нет')).not.toBeInTheDocument();
  });

  it('should keep the rest of the card, with a muted note, when the trusted persons cannot be loaded', async () => {
    setup([{ path: '/api/v1/patients/p1/related', respond: () => { throw problem(500, 'INTERNAL'); } }]);

    expect(await screen.findByRole('heading', { level: 1, name: 'Кузнецов Алексей Иванович' })).toBeInTheDocument();
    expect(await screen.findByText('Данные о доверенных лицах недоступны')).toBeInTheDocument();
    expect(await within(await screen.findByRole('region', { name: 'История обращений' })).findByText('Острый назофарингит')).toBeInTheDocument();
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

    const section = within(await screen.findByRole('region', { name: 'Все назначения' }));

    expect(await section.findByText('J01FA10')).toBeInTheDocument();
    expect(section.getByText('Азитромицин')).toBeInTheDocument();
    expect(section.getByText('1 таб 3 раза в день')).toBeInTheDocument();
    expect(section.getByText('A01.001')).toBeInTheDocument();
    expect(section.getByText('Консультация кардиолога')).toBeInTheDocument();
  });

  it('should not render an empty ATC chip for a service request', async () => {
    setup([{ path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([SERVICE]) }]);

    const section = within(await screen.findByRole('region', { name: 'Все назначения' }));
    await section.findByText('Консультация кардиолога');

    expect(section.getAllByTestId('code-chip')).toHaveLength(1);
    expect(section.getByText('Услуга')).toBeInTheDocument();
  });

  it('should name the order in the link back to its encounter so the links of a list are distinguishable', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'Все назначения' }));

    expect(await section.findByRole('link', { name: 'Открыть приём с назначением: Азитромицин' })).toHaveAttribute('href', '/encounters/enc-9');
    expect(section.getByRole('link', { name: 'Открыть приём с назначением: Консультация кардиолога' })).toBeInTheDocument();
  });

  it('should leave the full list out and say so once, in the summary, when there are no prescriptions', async () => {
    setup([{ path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([]) }]);

    expect(await within(await screen.findByRole('region', { name: 'Клиническая сводка' })).findByText('Действующих назначений нет')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Все назначения' })).not.toBeInTheDocument();
  });

})

describe('PatientCardView history cards (A2)', () => {
  it('should open the newest visit by default and fold the others', async () => {
    setup([{ path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY, OLDER]) }]);

    const section = within(await screen.findByRole('region', { name: 'История обращений' }));
    const [newest, oldest] = (await section.findAllByRole('button')).filter((button) => button.hasAttribute('aria-expanded'));

    expect(newest).toHaveAttribute('aria-expanded', 'true');
    expect(oldest).toHaveAttribute('aria-expanded', 'false');
    expect(section.getByText('Покой')).toBeInTheDocument();
    expect(section.queryByText('Контроль')).not.toBeInTheDocument();
  });

  it('should unfold a folded visit in place and fold it again', async () => {
    setup([{ path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY, OLDER]) }]);
    const section = within(await screen.findByRole('region', { name: 'История обращений' }));
    const oldest = (await section.findAllByRole('button', { expanded: false }))[0] as HTMLElement;

    await userEvent.click(oldest);
    expect(await section.findByText('Контроль')).toBeInTheDocument();
    await userEvent.click(oldest);

    expect(section.queryByText('Контроль')).not.toBeInTheDocument();
  });

  it('should list the orders of an opened visit, matched by the encounter they came from', async () => {
    setup();

    const section = within(await screen.findByRole('region', { name: 'История обращений' }));

    expect(await section.findByText('Азитромицин — 1 таб 3 раза в день')).toBeInTheDocument();
    expect(section.getByText('Консультация кардиолога')).toBeInTheDocument();
  });
});

describe('PatientCardView clinical summary (A2)', () => {
  it('should summarise recent diagnoses, current prescriptions and the last vitals beside the visits', async () => {
    setup();

    const summary = within(await screen.findByRole('region', { name: 'Клиническая сводка' }));

    expect(await summary.findByText('Острый назофарингит')).toBeInTheDocument();
    expect(await summary.findByText('Азитромицин')).toBeInTheDocument();
    expect(await summary.findByText('Температура тела')).toBeInTheDocument();
    expect(summary.getByText('36,6 °C')).toBeInTheDocument();
  });

  it('should list a diagnosis once, with its latest date, even when several visits carry it', async () => {
    setup([{ path: '/api/v1/patients/p1/history', respond: () => pageOf([HISTORY, OLDER]) }]);

    const summary = within(await screen.findByRole('region', { name: 'Клиническая сводка' }));
    await summary.findByText('Острый назофарингит');

    expect(summary.getAllByText('Острый назофарингит')).toHaveLength(1);
  });

  it('should leave orders that are no longer in force out of the current ones', async () => {
    setup([{ path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([{ ...MEDICATION, status: 'completed' }, SERVICE]) }]);

    const summary = within(await screen.findByRole('region', { name: 'Клиническая сводка' }));

    expect(await summary.findByText('Консультация кардиолога')).toBeInTheDocument();
    expect(summary.queryByText('Азитромицин')).not.toBeInTheDocument();
  });

  it('should show the next booked visit with this doctor, and not the one of another patient', async () => {
    setup([{
      path: '/api/v1/doctor/appointments',
      respond: () => pageOf([
        appointment({ id: 'a-other', patientId: 'p2', start: '2026-10-27T06:00:00Z', serviceName: 'Чужая услуга' }),
        appointment({ id: 'a-mine', patientId: 'p1', start: '2026-10-27T07:00:00Z', serviceName: 'Повторный приём' }),
      ]),
    }]);

    const summary = within(await screen.findByRole('region', { name: 'Клиническая сводка' }));

    expect(await summary.findByText('Повторный приём')).toBeInTheDocument();
    expect(summary.queryByText('Чужая услуга')).not.toBeInTheDocument();
  });

  it('should say in one line each that there is nothing yet for a new patient', async () => {
    setup([
      { path: '/api/v1/patients/p1/history', respond: () => pageOf([]) },
      { path: '/api/v1/patients/p1/prescriptions', respond: () => pageOf([]) },
    ]);

    const summary = within(await screen.findByRole('region', { name: 'Клиническая сводка' }));

    expect(await summary.findByText('Диагнозов пока нет')).toBeInTheDocument();
    expect(summary.getByText('Действующих назначений нет')).toBeInTheDocument();
    expect(await summary.findByText('Показателей пока нет')).toBeInTheDocument();
    expect(summary.getByText('Приёмов у вас не запланировано')).toBeInTheDocument();
  });

  it('should keep the other blocks when one of them cannot be loaded', async () => {
    setup([{ path: '/api/v1/patients/p1/prescriptions', respond: () => { throw problem(500, 'INTERNAL'); } }]);

    const summary = within(await screen.findByRole('region', { name: 'Клиническая сводка' }));

    expect(await summary.findByText('Острый назофарингит')).toBeInTheDocument();
    expect(await summary.findByTestId('problem-banner')).toBeInTheDocument();
  });
});

describe('PatientCardView consent (ADR-019, A1)', () => {
  it('should keep the consent forms folded away, with the history of visits first on the screen', async () => {
    setup();

    const heading = await screen.findByRole('heading', { level: 1, name: 'Кузнецов Алексей Иванович' });
    const toggle = await screen.findByRole('button', { name: 'Управление согласием', expanded: false });

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Записать отзыв' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('consent-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'История обращений' }).compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('should open the management from the consent line of the header: status, scan and a quiet revocation, no recording form', async () => {
    setup();

    const header = within(await screen.findByRole('region', { name: 'Кузнецов Алексей Иванович' }));
    await userEvent.click(await header.findByRole('button', { name: 'Управление согласием' }));

    const panel = within(await screen.findByRole('region', { name: 'Управление согласием' }));
    expect(await panel.findByText('Согласие действует')).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Записать отзыв' })).toBeInTheDocument();
    expect(panel.queryByRole('form', { name: 'Внести бумажное согласие или отказ' })).not.toBeInTheDocument();
  });

  it('should warn up front, before any encounter is tried, when the patient has no active consent, with one button to record it', async () => {
    setup([{ path: '/api/v1/patients/p1/consent', respond: () => ({ active: null, history: [] }) }]);

    expect(await screen.findByTestId('consent-banner')).toHaveTextContent('Нет действующего согласия на внесение сведений в информационную систему клиники');
    expect(screen.getByTestId('consent-line-none')).toHaveTextContent('Нет согласия на ведение записей в ИС клиники');

    await userEvent.click(screen.getByRole('button', { name: 'Внести согласие' }));

    expect(await screen.findByRole('form', { name: 'Внести бумажное согласие или отказ' })).toBeInTheDocument();
  });
});
