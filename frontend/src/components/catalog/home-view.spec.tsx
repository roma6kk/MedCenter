import { render, screen } from '@testing-library/react';
import type { CatalogService, Doctor } from './catalog-types';
import { HomeView } from './home-view';

const SERVICES: ReadonlyArray<CatalogService> = [
  { id: 'svc-1', name: 'Приём терапевта', typeSystem: 's', typeCode: '1', defaultDurationMin: 30, description: 'Первичная консультация', isActive: true },
  { id: 'svc-2', name: 'Приём кардиолога', typeSystem: 's', typeCode: '2', defaultDurationMin: 40, isActive: true },
];
const DOCTORS: ReadonlyArray<Doctor> = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, firstName: 'Имя', lastName: id, name: `Имя ${id}`, specialty: 'Терапевт' }));

describe('HomeView', () => {
  it('should lead with the clinic name and the two ways in when the page opens', () => {
    render(<HomeView services={SERVICES} doctors={DOCTORS} isFailed={false} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Медицинский центр' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Записаться на приём' })).toHaveAttribute('href', '/booking');
    expect(screen.getByRole('link', { name: 'Найти врача' })).toHaveAttribute('href', '/doctors');
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

  it('should show a banner with a retry link instead of the catalog when it could not be loaded', () => {
    render(<HomeView services={[]} doctors={[]} isFailed />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не удалось загрузить данные каталога');
    expect(screen.getByRole('link', { name: 'Повторить' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Записаться на приём' })).toBeInTheDocument();
  });
});
