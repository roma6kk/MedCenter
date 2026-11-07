import { screen, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock, replace: jest.fn() }), usePathname: () => '/' }));
jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { useBookingDraftStore } from '@/store/use-booking-draft-store';
import { useSessionStore } from '@/store/use-session-store';
import { LATER_SLOT, SLOT, renderWithCatalog, serveCatalog } from './catalog-test-utils';
import type { CatalogService, Doctor } from './catalog-types';
import { CLINIC_LICENSE, CORPORATE_CLIENTS, DIRECTIONS, INSURANCE_PARTNERS } from './home-content';
import { HomeView } from './home-view';

const SERVICES: ReadonlyArray<CatalogService> = [
  { id: 'svc-1', name: 'Приём терапевта', typeSystem: 's', typeCode: '1', defaultDurationMin: 30, description: 'Первичная консультация', isActive: true },
  { id: 'svc-2', name: 'Приём кардиолога', typeSystem: 's', typeCode: '2', defaultDurationMin: 40, isActive: true },
];
const DOCTORS: ReadonlyArray<Doctor> = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, firstName: 'Имя', lastName: id, name: `Имя ${id}`, specialty: 'Терапевт', specialtyCode: '419192003' }));
const CARDIOLOGIST: Doctor = { id: 'k', firstName: 'Алексей', lastName: 'Петров', name: 'Алексей Петров', specialty: 'Кардиолог', specialtyCode: '394579002' };

const ALL_SPECIALTY_DOCTORS: ReadonlyArray<Doctor> = DIRECTIONS.flatMap((direction) => direction.specialtyCode === undefined ? [] : [{ id: direction.id, firstName: 'И', lastName: direction.id, name: direction.id, specialtyCode: direction.specialtyCode }]);

function renderHome(props: Partial<{ services: ReadonlyArray<CatalogService>; doctors: ReadonlyArray<Doctor>; isFailed: boolean }> = {}): RenderResult {
  return renderWithCatalog(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} {...props} />);
}

function signInAs(role: 'DOCTOR' | 'ADMIN'): void {
  useSessionStore.getState().setSession({ accessToken: 't', expiresAt: null, role, scope: null, patientRef: null, fhirUser: null });
}

describe('HomeView', () => {
  beforeEach(() => {
    pushMock.mockReset();
    serveCatalog();
    useBookingDraftStore.getState().clearDraft();
    useSessionStore.getState().clearSession();
  });

  it('should lead with what the clinic does and offer the departments and the booking as ways in when the page opens', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 1, name: 'Консультация, диагностика и наблюдение — в одном центре' })).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: /Консультация, диагностика/ });
    expect(within(hero).getByRole('link', { name: 'Записаться на приём' })).toHaveAttribute('href', '/booking');
    expect(within(hero).getByRole('link', { name: 'Найти врача' })).toHaveAttribute('href', '/doctors');
  });

  it('should make booking the primary action and finding a doctor the secondary one in the hero', () => {
    renderHome();

    const hero = screen.getByRole('region', { name: /Консультация, диагностика/ });
    const [primary, secondary] = within(hero).getAllByRole('link').filter((link) => ['Записаться на приём', 'Найти врача'].includes(link.textContent ?? ''));
    expect(primary).toHaveTextContent('Записаться на приём');
    expect(primary).toHaveClass('bg-primary');
    expect(secondary).toHaveTextContent('Найти врача');
    expect(secondary).not.toHaveClass('bg-primary');
  });

  it('should offer the nearest free windows of the doctors in the hero, each opening the booking on that slot', async () => {
    serveCatalog({ slots: { a: [LATER_SLOT], b: [SLOT] } });
    renderHome();

    const windows = await screen.findByRole('region', { name: 'Ближайшие свободные окна' });
    const first = await within(windows).findByTestId('hero-window-b');
    expect(within(windows).getAllByRole('listitem')).toHaveLength(2);
    expect(within(windows).getAllByRole('listitem')[0]).toContainElement(first);
    expect(first).toHaveAccessibleName(/^Записаться: завтра, 11:00, /);

    await userEvent.click(first);

    expect(useBookingDraftStore.getState()).toMatchObject({ doctorId: 'b', slotId: 'slot-1', step: 4 });
    expect(pushMock).toHaveBeenCalledWith('/booking');
  });

  it('should say so when no doctor has free time in the next two weeks', async () => {
    renderHome();

    expect(await screen.findByText(/В ближайшие две недели свободного времени нет\. Позвоните/)).toBeInTheDocument();
  });

  it('should draw no free-windows card when there are no doctors to offer', () => {
    renderWithCatalog(<HomeView services={[]} doctors={[]} isFailed={false} />);

    expect(screen.queryByRole('region', { name: 'Ближайшие свободные окна' })).not.toBeInTheDocument();
  });

  it('should keep a sticky booking bar for guests and patients on a phone, and none for staff', () => {
    const { unmount } = renderHome();

    expect(within(screen.getByTestId('mobile-book-bar')).getByRole('link', { name: 'Записаться на приём' })).toHaveAttribute('href', '/booking');
    unmount();
    signInAs('DOCTOR');
    renderHome();

    expect(screen.queryByTestId('mobile-book-bar')).not.toBeInTheDocument();
  });

  it.each([['DOCTOR'], ['ADMIN']] as const)('should offer %s no way into the booking anywhere on the landing: the booking would only answer them with a 403', async (role) => {
    serveCatalog({ slots: { a: [LATER_SLOT], b: [SLOT] } });
    signInAs(role);
    const { container } = renderHome();

    const windows = await screen.findByRole('region', { name: 'Ближайшие свободные окна' });
    await within(windows).findByTestId('hero-window-b');

    expect(container.querySelectorAll('a[href^="/booking"]')).toHaveLength(0);
    expect(screen.queryByRole('link', { name: /Записаться/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Записаться/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-book-bar')).not.toBeInTheDocument();
  });

  it('should leave staff «Найти врача» as the one action of the hero and of the closing band, in the primary look', () => {
    signInAs('DOCTOR');
    renderHome();

    const hero = within(screen.getByRole('region', { name: /Консультация, диагностика/ }));
    expect(hero.getByRole('link', { name: 'Найти врача' })).toHaveClass('bg-primary');
    const band = within(screen.getByRole('region', { name: 'Запишитесь на приём за пару минут' }));
    expect(band.getByRole('link', { name: 'Найти врача' })).toHaveAttribute('href', '/doctors');
    expect(band.queryByRole('link', { name: 'Записаться на приём' })).not.toBeInTheDocument();
  });

  it('should show staff the nearest times of the doctors as plain text, not as buttons that write a booking draft', async () => {
    serveCatalog({ slots: { a: [LATER_SLOT], b: [SLOT] } });
    signInAs('ADMIN');
    renderHome();

    const windows = await screen.findByRole('region', { name: 'Ближайшие свободные окна' });
    const time = await within(windows).findByTestId('hero-window-b');

    expect(time).toHaveTextContent('завтра, 11:00');
    expect(time.tagName).toBe('SPAN');
    expect(within(windows).queryByRole('button')).not.toBeInTheDocument();
  });

  it('should list every department of the clinic, diagnostics included, when every specialty has a doctor and there are services', () => {
    renderWithCatalog(<HomeView services={SERVICES} doctors={ALL_SPECIALTY_DOCTORS} isFailed={false} />);

    const departments = screen.getByRole('region', { name: 'Направления' });
    expect(within(departments).getAllByRole('article')).toHaveLength(DIRECTIONS.length);
    expect(within(departments).getByRole('heading', { level: 3, name: 'Функциональная диагностика' })).toBeInTheDocument();
    expect(within(departments).getByRole('link', { name: 'Найти врача' })).toHaveAttribute('href', '/doctors');
  });

  it('should lead each department to the doctors of its specialty and diagnostics to the services block when doctors are loaded', () => {
    renderWithCatalog(<HomeView services={SERVICES} doctors={[...DOCTORS, CARDIOLOGIST]} isFailed={false} />);

    const departments = screen.getByRole('region', { name: 'Направления' });
    expect(within(departments).getByRole('link', { name: /Врачи направления: Терапия/ })).toHaveAttribute('href', '/doctors?specialty=419192003');
    expect(within(departments).getByRole('link', { name: /Врачи направления: Кардиология/ })).toHaveAttribute('href', '/doctors?specialty=394579002');
    expect(within(departments).getByRole('link', { name: /Все услуги: Функциональная диагностика/ })).toHaveAttribute('href', '#services');
  });

  it('should give a specialty the landing has no text for its own department, in the doctors wording', () => {
    const endocrinologist: Doctor = { id: 'e', firstName: 'Ольга', lastName: 'Орлова', name: 'Ольга Орлова', specialty: 'Эндокринолог', specialtyCode: '394583002' };
    renderWithCatalog(<HomeView services={SERVICES} doctors={[...DOCTORS, endocrinologist]} isFailed={false} />);

    const departments = screen.getByRole('region', { name: 'Направления' });
    expect(within(departments).getByRole('link', { name: /Врачи направления: Эндокринолог/ })).toHaveAttribute('href', '/doctors?specialty=394583002');
  });

  it('should adapt the grid to the number of departments when only some specialties have doctors', () => {
    renderWithCatalog(<HomeView services={[]} doctors={DOCTORS} isFailed={false} />);

    const departments = screen.getByRole('region', { name: 'Направления' });
    expect(within(departments).getAllByRole('article')).toHaveLength(1);
    expect(within(departments).getAllByRole('article')[0]?.closest('ul')).toHaveClass('grid-cols-1');
  });

  it('should not draw the departments section at all when the clinic has neither doctors nor services', () => {
    renderWithCatalog(<HomeView services={[]} doctors={[]} isFailed={false} />);

    expect(screen.queryByRole('region', { name: 'Направления' })).not.toBeInTheDocument();
  });

  it('should hide a department that has no doctors of its specialty so that no card leads to an empty catalog', () => {
    renderHome();

    const departments = screen.getByRole('region', { name: 'Направления' });
    expect(within(departments).queryByRole('heading', { level: 3, name: 'Кардиология' })).not.toBeInTheDocument();
    expect(within(departments).queryByRole('heading', { level: 3, name: 'Хирургия' })).not.toBeInTheDocument();
    expect(within(departments).getByRole('heading', { level: 3, name: 'Терапия' })).toBeInTheDocument();
  });

  it('should keep the departments with a specialty when the catalog could not be read, as the doctors are then unknown', () => {
    renderWithCatalog(<HomeView services={[]} doctors={[]} isFailed />);

    const departments = within(screen.getByRole('region', { name: 'Направления' }));
    expect(departments.getAllByRole('article')).toHaveLength(DIRECTIONS.filter((direction) => direction.specialtyCode !== undefined).length);
    expect(departments.queryByRole('heading', { level: 3, name: 'Функциональная диагностика' })).not.toBeInTheDocument();
  });

  it('should show the licence and keep the demonstration note out of the page body when the page opens', () => {
    renderHome();

    const trust = screen.getByRole('region', { name: 'Почему нам доверяют' });
    expect(within(trust).getByText(`Специальное разрешение № ${CLINIC_LICENSE.number} от ${CLINIC_LICENSE.date}`)).toBeInTheDocument();
    expect(screen.queryByText(/Демонстрационные данные/)).not.toBeInTheDocument();
  });

  it('should name the companies and the insurers the clinic works with, as plain text, when the page opens', () => {
    renderHome();

    const audiences = screen.getByRole('region', { name: 'Кому мы помогаем' });
    for (const name of [...CORPORATE_CLIENTS, ...INSURANCE_PARTNERS]) expect(within(audiences).getByText(name)).toBeInTheDocument();
    expect(within(audiences).queryByRole('img')).not.toBeInTheDocument();
    expect(within(audiences).getByText(CORPORATE_CLIENTS[0]!).className).not.toMatch(/\bborder\b|rounded|\bbg-/);
  });

  it('should promise neither a contract, a policy nor a request channel the service cannot back when the page opens', () => {
    const { container } = renderHome();

    const audiences = screen.getByRole('region', { name: 'Кому мы помогаем' });
    expect(within(audiences).queryByRole('link', { name: 'Запросить предложение' })).not.toBeInTheDocument();
    expect(within(audiences).queryByRole('link', { name: 'Список партнёров' })).not.toBeInTheDocument();
    expect(audiences.textContent).not.toMatch(/договор|полис|график приёмов|отчётност/i);
    expect(container.querySelector('a[href^="mailto:b2b"]')).toBeNull();
    expect(container.querySelector('#partners')).toBeNull();
  });

  it('should lead the patient through four equal steps joined by a line when the page opens, with the booking only as the first', () => {
    renderHome();

    const path = screen.getByRole('region', { name: 'Ведём пациента от первого визита до результата' });
    expect(within(path).getAllByRole('listitem')).toHaveLength(4);
    expect(path.querySelectorAll('.bg-primary')).toHaveLength(0);
    expect(within(path).getAllByTestId('path-line')).toHaveLength(3);
  });

  it('should list the services, each leading to its doctors, when services are loaded', () => {
    renderHome();

    expect(screen.getByRole('link', { name: /Приём терапевта/ })).toHaveAttribute('href', '/doctors?serviceId=svc-1');
    expect(screen.getAllByTestId('service-card')).toHaveLength(2);
  });

  it('should show only the first four doctors with a link to all of them when more are loaded', () => {
    renderHome();

    expect(screen.getAllByTestId('doctor-card')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Все врачи' })).toHaveAttribute('href', '/doctors');
  });

  it('should draw no services block when there are no services', () => {
    renderWithCatalog(<HomeView services={[]} doctors={DOCTORS} isFailed={false} />);

    expect(screen.queryByText('Каталог услуг пока пуст.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Услуги' })).not.toBeInTheDocument();
  });

  it('should show the nearest free time and a booking link on the doctor cards of the landing', async () => {
    serveCatalog({ slots: { a: [SLOT] } });
    renderHome();

    const teaser = screen.getByRole('region', { name: 'Наши врачи' });
    expect((await within(teaser).findAllByText(/Ближайшее: завтра, 11:00/))).toHaveLength(1);
    expect(within(teaser).getByRole('link', { name: 'Записаться: a Имя' })).toHaveAttribute('href', '/booking?doctorId=a');
  });

  it('should keep the static sections and show a banner with a retry link instead of the live catalog when it could not be loaded', () => {
    renderWithCatalog(<HomeView services={[]} doctors={[]} isFailed />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не удалось загрузить данные каталога');
    expect(screen.getByRole('link', { name: 'Повторить' })).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('service-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('doctor-card')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Направления' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Контакты' })).toBeInTheDocument();
  });

  it('should offer the clinic contacts as working links when the page opens', () => {
    renderHome();

    expect(screen.getByRole('link', { name: '+375 17 000-00-00' })).toHaveAttribute('href', 'tel:+375170000000');
    expect(screen.getByRole('link', { name: 'info@lifeline.example' })).toHaveAttribute('href', 'mailto:info@lifeline.example');
  });
});
