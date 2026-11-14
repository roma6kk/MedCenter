import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

jest.mock('next/link', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ href, children, ...rest }: { readonly href: string; readonly children: ReactNode }) =>
      createElement('a', { href, 'data-next-link': 'true', ...rest }, children),
  };
});

import { RegisterForm } from './register-form';
import { apiFetch, ApiError } from '@/lib/api/api-fetch';
import type { ProblemDetails } from '@/lib/api/problem';
import { networkProblem } from '@/lib/api/problem-parse';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

function renderForm(): void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  render(<RegisterForm />, { wrapper: Wrapper });
}

function problem(overrides: Partial<ProblemDetails>): ProblemDetails {
  return { title: 'Error', status: 400, errorCode: 'VALIDATION_ERROR', ...overrides };
}

async function fillValidForm(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Email'), ' ivan@example.by ');
  await userEvent.type(screen.getByLabelText('Имя'), 'Иван');
  await userEvent.type(screen.getByLabelText('Фамилия'), 'Иванов');
  await userEvent.type(screen.getByLabelText('Дата рождения'), '1990-05-12');
  await userEvent.type(screen.getByLabelText('Пароль'), 'Str0ng!Pass');
  await userEvent.click(screen.getByRole('checkbox', { name: /согласие на обработку персональных данных/i }));
}

async function submit(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));
}

async function renderAndSubmitValid(): Promise<void> {
  renderForm();
  await fillValidForm();
  await submit();
}

describe('RegisterForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should ask for the account consent and say the clinic system consent is signed at the clinic', () => {
    renderForm();

    const box: HTMLElement = screen.getByRole('checkbox', { name: /согласие на обработку персональных данных/i });
    expect(box).toHaveAttribute('aria-required', 'true');
    expect(box).not.toBeChecked();
    expect(screen.getByText('Согласие распространяется только на личный кабинет и запись на приём. Согласие на внесение сведений в информационную систему клиники оформляется письменно в клинике.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /медицинск|медкарт/i })).not.toBeInTheDocument();
  });

  it('should leave the consent checkbox unchecked, state the scope and rights next to it and link to the policy', () => {
    renderForm();

    expect(screen.getByRole('checkbox', { name: /согласие на обработку персональных данных/i })).not.toBeChecked();
    expect(screen.getByText(/только на личный кабинет и запись на приём/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ваши права и последствия отказа' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Политика обработки персональных данных' })).toHaveAttribute('href', '/privacy');
  });

  it('should put a server error for the account consent on the checkbox', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(problem({ details: [{ field: 'accountConsent.accepted', message: 'accepted must be a boolean value' }] })));
    await renderAndSubmitValid();

    expect(await screen.findByRole('checkbox', { name: /согласие на обработку персональных данных/i })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should say which fields are required and mark them for assistive technology when the form opens', () => {
    renderForm();

    expect(screen.getByText('Все поля, кроме пола и телефона, обязательны для заполнения.')).toBeInTheDocument();
    ['Email', 'Имя', 'Фамилия', 'Дата рождения', 'Пароль'].forEach((label) => expect(screen.getByLabelText(label)).toHaveAttribute('aria-required', 'true'));
    expect(screen.getByLabelText('Пол')).not.toHaveAttribute('aria-required');
    expect(screen.getByLabelText('Телефон')).not.toHaveAttribute('aria-required');
  });

  it('should lead «Уже есть аккаунт? Войти» straight to the sign-in redirect with a plain anchor', () => {
    renderForm();

    const loginLink = screen.getByRole('link', { name: 'Войти' });
    expect(loginLink).toHaveAttribute('href', '/api/auth/authorize');
    expect(loginLink).not.toHaveAttribute('data-next-link');
  });

  it('should show a required message for every empty field and not call the API when the form is submitted empty', async () => {
    renderForm();

    await submit();

    expect(await screen.findAllByText('Поле обязательно для заполнения')).toHaveLength(5);
    expect(screen.getByText('Подтвердите согласие, чтобы создать личный кабинет')).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should post the trimmed registration and offer the login link when the form is valid', async () => {
    apiFetchMock.mockResolvedValue({ id: 'u-1' });
    await renderAndSubmitValid();

    expect(await screen.findByTestId('register-success')).toBeInTheDocument();
    const [path, options] = apiFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/v1/auth/register');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ email: 'ivan@example.by', firstName: 'Иван', lastName: 'Иванов', password: 'Str0ng!Pass', birthDate: '1990-05-12', accountConsent: { accepted: true, textVersion: '2026-11' } });
    const loginLink = screen.getByRole('link', { name: 'Войти' });
    expect(loginLink).toHaveAttribute('href', '/api/auth/authorize');
    expect(loginLink).not.toHaveAttribute('data-next-link');
  });

  it('should put server field errors next to their fields when the API answers VALIDATION_ERROR', async () => {
    apiFetchMock.mockRejectedValue(
      new ApiError(
        problem({
          details: [
            { field: 'email', message: 'email must be an email' },
            { field: 'password', message: 'password is not strong enough' },
          ],
        }),
      ),
    );
    await renderAndSubmitValid();

    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription('Введите корректный email');
    expect(screen.getByLabelText('Пароль')).toHaveAccessibleDescription(expect.stringContaining('Пароль недостаточно надёжный'));
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should put the age message on the birth date when the API answers AGE_RESTRICTED', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(problem({ status: 422, errorCode: 'AGE_RESTRICTED', details: [{ field: 'birthDate', message: 'must be 18 or older to register' }] })));
    await renderAndSubmitValid();

    expect(await screen.findByLabelText('Дата рождения')).toHaveAccessibleDescription(expect.stringContaining('Регистрация доступна только с 18 лет'));
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should refuse a minor birth date before calling the API', async () => {
    renderForm();
    await fillValidForm();
    const birthDate = screen.getByLabelText('Дата рождения');
    await userEvent.clear(birthDate);
    await userEvent.type(birthDate, `${new Date().getFullYear() - 5}-01-01`);
    await submit();

    expect(await screen.findByLabelText('Дата рождения')).toHaveAccessibleDescription(expect.stringContaining('только с 18 лет'));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should show a banner when the server names a field the form does not have', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(problem({ details: [{ field: 'nickname', message: 'nickname must be a string' }] })));
    await renderAndSubmitValid();

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
  });

  it('should post the phone normalised to +375XXXXXXXXX when one is typed', async () => {
    apiFetchMock.mockResolvedValue({ id: 'u-1' });
    renderForm();

    await fillValidForm();
    await userEvent.type(screen.getByLabelText('Телефон'), '+375 (29) 123-45-67');
    await submit();

    expect(await screen.findByTestId('register-success')).toBeInTheDocument();
    expect(JSON.parse(String(apiFetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ phone: '+375291234567' });
  });

  it('should refuse a foreign phone before calling the API and show it on the phone field', async () => {
    renderForm();

    await fillValidForm();
    await userEvent.type(screen.getByLabelText('Телефон'), '+7 912 345 67 89');
    await submit();

    expect(await screen.findByLabelText('Телефон')).toHaveAccessibleDescription(expect.stringContaining('+375'));
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('should put a server error for the phone next to the phone field in the language of the page', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(problem({ details: [{ field: 'phone', message: 'phone must be a Belarus number: +375 and nine digits' }] })));
    renderForm();

    await fillValidForm();
    await userEvent.type(screen.getByLabelText('Телефон'), '+375291234567');
    await submit();

    expect(await screen.findByLabelText('Телефон')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should hint at the email field with a login link when the email is already registered', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(problem({ status: 409, errorCode: 'CONFLICT', detail: 'EMAIL_TAKEN: a user with this email already exists' })));
    await renderAndSubmitValid();

    expect(await screen.findByText(/Этот email уже зарегистрирован/)).toBeInTheDocument();
    const loginLink = screen.getByRole('link', { name: 'Войти с этим email' });
    expect(loginLink).toHaveAttribute('href', expect.stringContaining('/api/auth/authorize'));
    expect(loginLink).not.toHaveAttribute('data-next-link');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should show the problem banner with its code when the server fails in any other way', async () => {
    apiFetchMock.mockRejectedValue(new ApiError(problem({ status: 500, errorCode: 'INTERNAL', requestId: 'req-1' })));
    await renderAndSubmitValid();

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('INTERNAL');
  });

  it('should keep the submit button focused and send one request when the request is running and the visitor presses it again', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    apiFetchMock.mockReturnValue(new Promise((done) => { resolve = done; }));
    await renderAndSubmitValid();

    const busy: HTMLElement = await screen.findByRole('button', { name: 'Регистрируем…' });
    await userEvent.click(busy);
    await userEvent.keyboard('{Enter}');
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveFocus();
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    resolve({ id: 'u-1' });
    expect(await screen.findByTestId('register-success')).toBeInTheDocument();
  });

  it('should close the submit button for the Retry-After period and then send again when the server answers 429', async () => {
    apiFetchMock
      .mockRejectedValueOnce(new ApiError(problem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 1 })))
      .mockResolvedValueOnce({ id: 'u-1' });
    await renderAndSubmitValid();
    const waiting: HTMLElement = await screen.findByRole('button', { name: 'Повторить через 1 с' });
    await userEvent.click(waiting);
    await userEvent.type(screen.getByLabelText('Имя'), '{Enter}');

    expect(waiting).toHaveAttribute('aria-disabled', 'true');
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    await userEvent.click(await screen.findByRole('button', { name: 'Зарегистрироваться' }, { timeout: 3000 }));
    expect(await screen.findByTestId('register-success')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('should leave the submit button open and show the banner when the connection is lost', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(networkProblem())).mockResolvedValueOnce({ id: 'u-1' });
    await renderAndSubmitValid();

    expect(await screen.findByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Зарегистрироваться' })).not.toHaveAttribute('aria-disabled');
    await submit();
    expect(await screen.findByTestId('register-success')).toBeInTheDocument();
  });
});
