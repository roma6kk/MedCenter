import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { showToast } from '@/lib/ui/toast';
import { apiProblem, renderWithClient } from '../shared/test-utils';
import { SettingsPanel } from './settings-panel';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});
jest.mock('@/lib/ui/toast', () => ({ showToast: jest.fn() }));

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

const CLINIC = { name: 'ООО «Лайфлайн»', phone: '+375 17 000-00-00', email: 'info@lifeline.example', address: 'г. Минск, ул. Здоровья, 12', hours: 'Пн–Пт 08:00–20:00' };

function patchCall(): readonly [string, RequestInit?] | undefined {
  return apiFetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH');
}

async function save(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    (showToast as jest.Mock).mockReset();
    apiFetchMock.mockImplementation((_path, options) => Promise.resolve(options?.method === 'PATCH' ? JSON.parse(String(options.body)) : CLINIC));
  });

  it('should fill the form with the stored details', async () => {
    renderWithClient(<SettingsPanel />);

    expect(await screen.findByLabelText(/Название клиники/)).toHaveValue('ООО «Лайфлайн»');
    expect(screen.getByLabelText(/Телефон регистратуры/)).toHaveValue('+375 17 000-00-00');
    expect(screen.getByLabelText(/Эл\. почта/)).toHaveValue('info@lifeline.example');
    expect(screen.getByLabelText(/Адрес/)).toHaveValue('г. Минск, ул. Здоровья, 12');
    expect(screen.getByLabelText(/Часы работы/)).toHaveValue('Пн–Пт 08:00–20:00');
  });

  it('should send the details with a PATCH and confirm with a toast', async () => {
    renderWithClient(<SettingsPanel />);
    const phone = await screen.findByLabelText(/Телефон регистратуры/);
    await userEvent.clear(phone);
    await userEvent.type(phone, '+375 29 123-45-67');

    await save();

    await waitFor(() => expect(patchCall()).toBeDefined());
    const [path, options] = patchCall() ?? [];
    expect(path).toBe('/api/v1/admin/clinic');
    expect(JSON.parse(String(options?.body))).toEqual({ ...CLINIC, phone: '+375 29 123-45-67' });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'admin.settings.toast.saved'));
  });

  it('should not send anything when the phone is not a Belarus number', async () => {
    renderWithClient(<SettingsPanel />);
    const phone = await screen.findByLabelText(/Телефон регистратуры/);
    await userEvent.clear(phone);
    await userEvent.type(phone, '12345');

    await save();

    expect(await screen.findByText(/Телефон: \+375 и девять цифр/)).toBeInTheDocument();
    expect(patchCall()).toBeUndefined();
  });

  it('should show the problem when the server refuses the change', async () => {
    renderWithClient(<SettingsPanel />);
    await screen.findByLabelText(/Название клиники/);
    apiFetchMock.mockImplementation((_path, options) => (options?.method === 'PATCH' ? Promise.reject(apiProblem({ status: 500, errorCode: 'INTERNAL' })) : Promise.resolve(CLINIC)));

    await save();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
