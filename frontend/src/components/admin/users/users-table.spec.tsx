import { render, screen } from '@testing-library/react';
import { UsersTable } from './users-table';

const meta = { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 };

describe('UsersTable', () => {
  it('should show active and deactivated status for each user when the list is shown', () => {
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

  it('should name the roles in the language of the interface when the roles are shown, instead of their codes', () => {
    render(<UsersTable rows={[{ id: 'u1', name: 'Иванова Анна', roles: ['DOCTOR', 'ADMIN'], isActive: true }]} meta={meta} onPage={jest.fn()} />);

    expect(screen.getAllByText('Врач').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Администратор').length).toBeGreaterThan(0);
    expect(screen.queryByText('DOCTOR')).not.toBeInTheDocument();
  });

  it('should show a role this screen does not know by its code when the server sends a new one', () => {
    render(<UsersTable rows={[{ id: 'u1', name: 'Кто-то', roles: ['AUDITOR'], isActive: true }]} meta={meta} onPage={jest.fn()} />);

    expect(screen.getAllByText('AUDITOR').length).toBeGreaterThan(0);
  });

  it('should show the whole PractitionerRole id on screen when the account is linked to one', () => {
    const link = 'PractitionerRole/6ef5270b-6282-5a43-87f9-26d2d8b0c4f7';
    render(<UsersTable rows={[{ id: 'u1', name: 'Иванова Анна', roles: ['DOCTOR'], practitionerRoleRef: link }]} meta={meta} onPage={jest.fn()} />);

    expect(screen.getAllByText(link).length).toBeGreaterThan(0);
  });
  describe('consent link', () => {
    const patient = { id: 'u1', name: 'Кузнецов Алексей', roles: ['PATIENT'], patientRef: 'Patient/p-77', isActive: true };
    const doctor = { id: 'u2', name: 'Иванова Анна', roles: ['DOCTOR'], practitionerRoleRef: 'PractitionerRole/r1', isActive: true };

    it('should link an account tied to a patient to the consent page of that patient when links are enabled', () => {
      render(<UsersTable rows={[patient, doctor]} meta={meta} onPage={jest.fn()} consentLinks />);

      // The table renders each row for both the wide and the narrow layout, so the link is there once per layout.
      const links = screen.getAllByRole('link', { name: /Согласие на электронную медкарту/ });
      expect(links.length).toBeGreaterThan(0);
      links.forEach((link) => {
        expect(link).toHaveAccessibleName('Согласие на электронную медкарту: Кузнецов Алексей');
        expect(link).toHaveAttribute('href', '/admin/patients/p-77/consent');
      });
    });

    it('should show no consent link unless links are enabled', () => {
      render(<UsersTable rows={[patient]} meta={meta} onPage={jest.fn()} />);

      expect(screen.queryByRole('link', { name: /Согласие/ })).not.toBeInTheDocument();
    });
  });
});
