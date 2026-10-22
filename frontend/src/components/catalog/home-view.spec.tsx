import { render, screen, within } from '@testing-library/react';
import type { CatalogService, Doctor } from './catalog-types';
import { CLINIC_LICENSE, CORPORATE_CLIENTS, DIRECTIONS, INSURANCE_PARTNERS } from './home-content';
import { HomeView } from './home-view';

const SERVICES: ReadonlyArray<CatalogService> = [
  { id: 'svc-1', name: 'Приём терапевта', typeSystem: 's', typeCode: '1', defaultDurationMin: 30, description: 'Первичная консультация', isActive: true },
  { id: 'svc-2', name: 'Приём кардиолога', typeSystem: 's', typeCode: '2', defaultDurationMin: 40, isActive: true },
];
const DOCTORS: ReadonlyArray<Doctor> = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, firstName: 'Имя', lastName: id, name: `Имя ${id}`, specialty: 'Терапевт' }));

describe('HomeView', () => {
  it('should lead with what the clinic does and offer the departments and the booking as ways in when the page opens', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Консультация, диагностика и наблюдение — в одном центре' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Выбрать направление' })).toHaveAttribute('href', '#directions');
    const hero = screen.getByRole('region', { name: /Консультация, диагностика/ });
    expect(within(hero).getByRole('link', { name: 'Записаться на приём' })).toHaveAttribute('href', '/booking');
  });

  it('should list every department of the clinic when the page opens', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    const departments = screen.getByRole('region', { name: 'Направления' });
    expect(within(departments).getAllByRole('article')).toHaveLength(DIRECTIONS.length);
    expect(within(departments).getByRole('heading', { level: 3, name: 'Функциональная диагностика' })).toBeInTheDocument();
    expect(within(departments).getByRole('link', { name: 'Найти врача' })).toHaveAttribute('href', '/doctors');
  });

  it('should show the licence and the demonstration note when the page opens', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    const trust = screen.getByRole('region', { name: 'Почему нам доверяют' });
    expect(within(trust).getByText(`Специальное разрешение № ${CLINIC_LICENSE.number} от ${CLINIC_LICENSE.date}`)).toBeInTheDocument();
    expect(screen.getByText(/Демонстрационные данные/)).toBeInTheDocument();
  });

  it('should name the companies and the insurers the clinic works with, as plain text, when the page opens', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    const audiences = screen.getByRole('region', { name: 'Кому мы помогаем' });
    for (const name of [...CORPORATE_CLIENTS, ...INSURANCE_PARTNERS]) expect(within(audiences).getByText(name)).toBeInTheDocument();
    expect(within(audiences).queryByRole('img')).not.toBeInTheDocument();
    expect(within(audiences).getByRole('link', { name: 'Запросить предложение' }).getAttribute('href')).toMatch(/^mailto:/);
    expect(within(audiences).getByRole('link', { name: 'Список партнёров' })).toHaveAttribute('href', '#partners');
  });

  it('should lead the patient through four steps when the page opens, with the booking only as the first', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    const path = screen.getByRole('region', { name: 'Ведём пациента от первого визита до результата' });
    expect(within(path).getAllByRole('listitem')).toHaveLength(4);
  });

  it('should list the services, each leading to its doctors, when services are loaded', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    expect(screen.getByRole('link', { name: /Приём терапевта/ })).toHaveAttribute('href', '/doctors?serviceId=svc-1');
    expect(screen.getAllByTestId('service-card')).toHaveLength(2);
  });

  it('should show only the first four doctors with a link to all of them when more are loaded', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    expect(screen.getAllByTestId('doctor-card')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Все врачи' })).toHaveAttribute('href', '/doctors');
  });

  it('should say the service list is empty when there are no services', () => {
    render(<HomeView services={[]} doctors={[]} isFailed={false} />);

    expect(screen.getByText('Каталог услуг пока пуст.')).toBeInTheDocument();
  });

  it('should keep the static sections and show a banner with a retry link instead of the live catalog when it could not be loaded', () => {
    render(<HomeView services={[]} doctors={[]} isFailed />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не удалось загрузить данные каталога');
    expect(screen.getByRole('link', { name: 'Повторить' })).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('service-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('doctor-card')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Направления' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Контакты' })).toBeInTheDocument();
  });

  it('should offer the clinic contacts as working links when the page opens', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    expect(screen.getByRole('link', { name: '+375 17 000-00-00' })).toHaveAttribute('href', 'tel:+375170000000');
    expect(screen.getByRole('link', { name: 'info@lifeline.example' })).toHaveAttribute('href', 'mailto:info@lifeline.example');
  });
});
