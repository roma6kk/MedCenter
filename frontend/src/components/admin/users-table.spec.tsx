import { render, screen } from '@testing-library/react';
import { UsersTable } from './users-table';

const meta = { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 };

describe('UsersTable', () => {
  it('should show active and deactivated status for each user', () => {
    render(
      <UsersTable
        rows={[
          { id: 'u1', name: 'Иванова Анна', role: 'DOCTOR', isActive: true },
          { id: 'u2', name: 'Петров Пётр', role: 'PATIENT', isActive: false },
        ]}
        meta={meta}
        onPage={jest.fn()}
      />,
    );

    expect(screen.getAllByText('Активен').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Деактивирован').length).toBeGreaterThan(0);
  });

  it('should render a dash when the role is unknown', () => {
    render(<UsersTable rows={[{ id: 'u3', name: 'Без роли' }]} meta={meta} onPage={jest.fn()} />);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
