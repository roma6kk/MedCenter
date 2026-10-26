import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('should say in words what an account is linked to instead of a raw FHIR reference when it has links', () => {
    const rows = [
      { id: 'u1', name: 'Иванова Анна', roles: ['DOCTOR'], practitionerRoleRef: 'PractitionerRole/6ef5270b-6282-5a43-87f9-26d2d8b0c4f7' },
      { id: 'u2', name: 'Кузнецов Алексей', roles: ['PATIENT'], patientRef: 'Patient/1417' },
    ];
    render(<UsersTable rows={rows} meta={meta} onPage={jest.fn()} practitionerRoles={new Map([['6ef5270b-6282-5a43-87f9-26d2d8b0c4f7', 'Терапевт']])} />);

    expect(screen.getAllByText('Врач · Терапевт').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Медкарта пациента').length).toBeGreaterThan(0);
    expect(screen.queryByText(/PractitionerRole\//)).not.toBeInTheDocument();
    expect(screen.queryByText(/Patient\/1417/)).not.toBeInTheDocument();
  });

  it('should keep the raw reference in the tooltip for the admin who needs the id', () => {
    const link = 'PractitionerRole/6ef5270b-6282-5a43-87f9-26d2d8b0c4f7';
    render(<UsersTable rows={[{ id: 'u1', name: 'Иванова Анна', roles: ['DOCTOR'], practitionerRoleRef: link }]} meta={meta} onPage={jest.fn()} />);

    expect(screen.getAllByTitle(link).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Врач').length).toBeGreaterThan(0);
  });

  it('should put every row action in one menu with the primary action first and the destructive one last', async () => {
    const onEdit = jest.fn();
    const onDeactivate = jest.fn();
    render(<UsersTable rows={[{ id: 'u1', name: 'Иванова Анна', roles: ['DOCTOR'], isActive: true }]} meta={meta} onPage={jest.fn()} onEdit={onEdit} onDeactivate={onDeactivate} />);
    expect(screen.queryByRole('button', { name: /Деактивировать/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Действия: Иванова Анна' })[0]!);
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Изменить', 'Деактивировать']);
    expect(items[1]).toHaveClass('text-destructive');
    await userEvent.click(items[1]!);

    expect(onDeactivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('should offer to activate instead of deactivate when the account is deactivated', async () => {
    const onActivate = jest.fn();
    render(<UsersTable rows={[{ id: 'u1', name: 'Иванова Анна', isActive: false }]} meta={meta} onPage={jest.fn()} onActivate={onActivate} onDeactivate={jest.fn()} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Действия: Иванова Анна' })[0]!);

    expect(screen.queryByRole('menuitem', { name: 'Деактивировать' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Активировать' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  describe('consent link', () => {
    const patient = { id: 'u1', name: 'Кузнецов Алексей', roles: ['PATIENT'], patientRef: 'Patient/p-77', isActive: true };
    const doctor = { id: 'u2', name: 'Иванова Анна', roles: ['DOCTOR'], practitionerRoleRef: 'PractitionerRole/r1', isActive: true };

    it('should link an account tied to a patient to the consent page of that patient from its menu when links are enabled', async () => {
      render(<UsersTable rows={[patient, doctor]} meta={meta} onPage={jest.fn()} consentLinks />);

      await userEvent.click(screen.getAllByRole('button', { name: 'Действия: Кузнецов Алексей' })[0]!);

      const link = screen.getByRole('menuitem', { name: 'Согласие на ЭМК' });
      expect(link).toHaveAttribute('href', '/admin/patients/p-77/consent');
    });

    it('should not offer a consent link for an account that is not tied to a patient', () => {
      render(<UsersTable rows={[doctor]} meta={meta} onPage={jest.fn()} consentLinks />);

      expect(screen.queryByRole('button', { name: /^Действия:/ })).not.toBeInTheDocument();
    });

    it('should show no consent link unless links are enabled', () => {
      render(<UsersTable rows={[patient]} meta={meta} onPage={jest.fn()} />);

      expect(screen.queryByRole('button', { name: /^Действия:/ })).not.toBeInTheDocument();
    });
  });
});
