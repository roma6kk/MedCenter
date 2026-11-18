import { screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { renderWithCatalog } from './catalog-test-utils';
import { phoneHref, useClinic } from './use-clinic';

jest.mock('@/lib/api/api-fetch');

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;

function Probe(): ReactNode {
  const clinic = useClinic();
  return <p>{`${clinic.name} | ${clinic.phone} | ${clinic.address} | ${clinic.hours}`}</p>;
}

describe('useClinic', () => {
  it('should show the demo constants while the answer is pending', () => {
    apiFetchMock.mockReturnValue(new Promise(() => undefined));
    renderWithCatalog(<Probe />);

    expect(screen.getByText('ООО «Лайфлайн» | +375 17 000-00-00 | г. Минск, ул. Здоровья, 12 | Пн–Пт 08:00–20:00, сб 09:00–15:00')).toBeInTheDocument();
  });

  it('should show the details the server returns', async () => {
    apiFetchMock.mockResolvedValue({ name: 'Клиника N', phone: '+375 29 111-22-33', email: 'a@b.by', address: 'г. Гомель', hours: 'Круглосуточно' });
    renderWithCatalog(<Probe />);

    expect(await screen.findByText('Клиника N | +375 29 111-22-33 | г. Гомель | Круглосуточно')).toBeInTheDocument();
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/clinic');
  });

  it('should keep the demo constants when the request fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('offline'));
    renderWithCatalog(<Probe />);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(screen.getByText(/ООО «Лайфлайн» \| \+375 17 000-00-00/)).toBeInTheDocument();
  });
});

describe('phoneHref', () => {
  it('should drop the spaces and dashes', () => {
    expect(phoneHref('+375 17 000-00-00')).toBe('tel:+375170000000');
  });
});
