import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { apiProblem, renderWithClient } from '../shared/test-utils';
import { UserFormDialog } from './user-form-dialog';
import type { AdminUser } from './user-types';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const doctor: AdminUser = {
  id: 'u1',
  email: 'doc@medcenter.test',
  firstName: 'Мария',
  lastName: 'Иванова',
  roles: ['DOCTOR'],
  patientRef: null,
  practitionerRoleRef: null,
  isActive: true,
  name: 'Иванова Мария',
  role: 'DOCTOR',
};

const linkedDoctor: AdminUser = { ...doctor, practitionerRoleRef: 'PractitionerRole/6ef5270b' };

async function fillNewAdmin(): Promise<void> {
  await userEvent.type(screen.getByLabelText(/Фамилия/), 'Тестов');
  await userEvent.type(screen.getByLabelText(/Имя/), 'Админ');
  await userEvent.type(screen.getByLabelText(/Email/), 'new.admin@medcenter.test');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Пациент' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Администратор' }));
  await userEvent.type(screen.getByLabelText(/Пароль/), 'Str0ng!Pass1');
}

describe('UserFormDialog (create)', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should post the account to /admin/users without the empty optional fields when the form is valid', async () => {
    apiFetchMock.mockResolvedValue({ ...doctor, id: 'u2' });
    const onClose = jest.fn();
    renderWithClient(<UserFormDialog onClose={onClose} />);
    await fillNewAdmin();

    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/admin/users');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({
      email: 'new.admin@medcenter.test',
      firstName: 'Админ',
      lastName: 'Тестов',
      password: 'Str0ng!Pass1',
      roles: ['ADMIN'],
    });
  });

  it('should show the validation errors and send nothing when the form is empty', async () => {
    renderWithClient(<UserFormDialog onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    expect((await screen.findAllByText('Поле обязательно для заполнения')).length).toBeGreaterThanOrEqual(3);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should focus the first invalid field in screen order when the submit fails the check', async () => {
    renderWithClient(<UserFormDialog onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    await waitFor(() => expect(screen.getByLabelText(/Фамилия/)).toHaveFocus());
  });

  it('should put EMAIL_TAKEN at the email field, focus it and not repeat it in a banner when the server answers 409', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: a user with this email already exists' }));
    renderWithClient(<UserFormDialog onClose={jest.fn()} />);
    await fillNewAdmin();

    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    expect(await screen.findByText('Пользователь с таким email уже существует')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toHaveFocus();
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should not announce the old failure again when the email is edited after EMAIL_TAKEN', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: a user with this email already exists' }));
    renderWithClient(<UserFormDialog onClose={jest.fn()} />);
    await fillNewAdmin();
    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));
    await screen.findByText('Пользователь с таким email уже существует');

    await userEvent.type(screen.getByLabelText(/Email/), 'x');

    expect(screen.queryByText('Пользователь с таким email уже существует')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should drop the banner of a failure that belongs to no field when the next submit is invalid', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 500, errorCode: 'INTERNAL' }));
    renderWithClient(<UserFormDialog onClose={jest.fn()} />);
    await fillNewAdmin();
    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Email/));
    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    await waitFor(() => expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument());
  });

  it('should send the account without the PractitionerRole when a typed id is left in the hidden field after DOCTOR is unchecked', async () => {
    apiFetchMock.mockResolvedValue({ ...doctor, id: 'u3' });
    const onClose = jest.fn();
    renderWithClient(<UserFormDialog onClose={onClose} />);
    await fillNewAdmin();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Врач' }));
    await userEvent.type(screen.getByLabelText(/Роль врача/), 'role-1');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Врач' }));

    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(JSON.parse(String(apiFetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('practitionerRoleId');
  });

  it('should not keep the new password in the mutation cache when the dialog is gone', async () => {
    apiFetchMock.mockResolvedValue({ ...doctor, id: 'u2' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <UserFormDialog onClose={jest.fn()} />
      </QueryClientProvider>,
    );
    await fillNewAdmin();
    await userEvent.click(screen.getByRole('button', { name: 'Создать пользователя' }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));

    unmount();

    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
  });

  it('should offer the PractitionerRole field only when the DOCTOR role is chosen', async () => {
    renderWithClient(<UserFormDialog onClose={jest.fn()} />);
    expect(screen.queryByLabelText(/Роль врача/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Врач' }));

    expect(screen.getByLabelText(/Роль врача/)).toBeInTheDocument();
  });

  it('should ask for the birth date only when the PATIENT role is chosen', async () => {
    renderWithClient(<UserFormDialog onClose={jest.fn()} />);
    expect(screen.getByLabelText(/Дата рождения/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Пациент' }));

    expect(screen.queryByLabelText(/Дата рождения/)).not.toBeInTheDocument();
  });
});

describe('UserFormDialog (edit)', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should patch only the changed field when the first name is edited', async () => {
    apiFetchMock.mockResolvedValue(doctor);
    const onClose = jest.fn();
    renderWithClient(<UserFormDialog user={doctor} onClose={onClose} />);

    await userEvent.clear(screen.getByLabelText(/Имя/));
    await userEvent.type(screen.getByLabelText(/Имя/), 'Анна');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/admin/users/u1');
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({ firstName: 'Анна' });
  });

  it('should put PRACTITIONER_ROLE_TAKEN at the PractitionerRole field when the role belongs to another account', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'PRACTITIONER_ROLE_TAKEN: this PractitionerRole is already linked to another user' }));
    renderWithClient(<UserFormDialog user={doctor} onClose={jest.fn()} />);

    await userEvent.type(screen.getByLabelText(/Роль врача/), '6ef5270b-6282-5a43-87f9-26d2d8b0c4f7');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Эта роль врача уже привязана к другой учётной записи')).toBeInTheDocument();
    expect(screen.getByLabelText(/Роль врача/)).toHaveFocus();
  });

  it('should show the SELF_LOCKOUT explanation in a banner when the server refuses to demote the administrator', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 409, errorCode: 'CONFLICT', detail: 'SELF_LOCKOUT: an administrator cannot deactivate or demote their own account' }));
    renderWithClient(<UserFormDialog user={{ ...doctor, roles: ['ADMIN', 'DOCTOR'], role: 'ADMIN' }} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Администратор' }));
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Нельзя деактивировать собственную учётную запись');
  });

  it('should release the PractitionerRole link and send the patch when DOCTOR is unchecked on a linked doctor', async () => {
    apiFetchMock.mockResolvedValue(linkedDoctor);
    const onClose = jest.fn();
    renderWithClient(<UserFormDialog user={linkedDoctor} onClose={onClose} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Врач' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Администратор' }));
    expect(screen.getByText(/Привязка к PractitionerRole будет снята/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(apiFetchMock.mock.calls[0]?.[1]?.body))).toEqual({ roles: ['ADMIN'], practitionerRoleId: null });
  });

  it('should not tell about a released link when the doctor keeps the DOCTOR role', () => {
    renderWithClient(<UserFormDialog user={linkedDoctor} onClose={jest.fn()} />);

    expect(screen.queryByText(/Привязка к PractitionerRole будет снята/)).not.toBeInTheDocument();
  });

  it('should lock the PATIENT role and say why when the account has no patient record', () => {
    renderWithClient(<UserFormDialog user={doctor} onClose={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Пациент' })).toBeDisabled();
    expect(screen.getByText(/нет карточки пациента/)).toBeInTheDocument();
  });

  it('should keep the PATIENT role editable when the account has a patient record', () => {
    renderWithClient(<UserFormDialog user={{ ...doctor, roles: ['PATIENT'], patientRef: 'Patient/p1', role: 'PATIENT' }} onClose={jest.fn()} />);

    expect(screen.getByRole('checkbox', { name: 'Пациент' })).toBeEnabled();
  });

  it('should put a 404 at the PractitionerRole field in Russian when the role id is unknown', async () => {
    apiFetchMock.mockRejectedValue(apiProblem({ status: 404, errorCode: 'NOT_FOUND', detail: 'requested resource does not exist' }));
    renderWithClient(<UserFormDialog user={doctor} onClose={jest.fn()} />);

    await userEvent.type(screen.getByLabelText(/Роль врача/), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/Роль врача с таким идентификатором не найдена/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Роль врача/)).toHaveFocus();
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should keep the focus on the submit button when the request is running', async () => {
    apiFetchMock.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<UserFormDialog user={doctor} onClose={jest.fn()} />);
    await userEvent.type(screen.getByLabelText(/Имя/), 'я');

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('button', { name: 'Сохраняем…' })).toHaveFocus();
  });
});
