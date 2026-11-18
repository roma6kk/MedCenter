import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from '@/lib/api/api-fetch';
import { ServiceStep } from './service-step';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;
const META = { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 };

function service(id: string, name: string, description?: string): Record<string, unknown> {
  return { id, name, typeSystem: 's', typeCode: id, defaultDurationMin: 30, isActive: true, ...(description === undefined ? {} : { description }) };
}

const THERAPIST = { id: 'd1', firstName: 'М', lastName: 'И', name: 'М И', specialty: 'Терапевт', specialtyCode: '419192003' };
const CARDIOLOGIST = { id: 'd2', firstName: 'А', lastName: 'П', name: 'А П', specialty: 'Кардиолог', specialtyCode: '394579002' };

const SERVICES = [
  service('s1', 'Приём терапевта (первичный)', 'Первичная консультация терапевта'),
  service('s2', 'Приём кардиолога (первичный)', 'Первичная консультация кардиолога'),
  service('s3', 'Электрокардиография (ЭКГ)', 'ЭКГ в покое с расшифровкой'),
];

function serve(doctorsOf: Readonly<Record<string, ReadonlyArray<unknown>>>): void {
  apiFetchMock.mockImplementation((path) => {
    if (path.startsWith('/api/v1/services')) return Promise.resolve({ items: SERVICES, meta: META });
    const id = /serviceId=([\w-]+)/.exec(path)?.[1] ?? '';
    return Promise.resolve({ items: doctorsOf[id] ?? [], meta: META });
  });
}

function renderStep(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = <QueryClientProvider client={client}><ServiceStep selectedServiceId={null} onSelect={jest.fn()} /></QueryClientProvider>;
  render(ui);
}

describe('ServiceStep grouping and cards (B10)', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should group the services by the direction of their doctors when the doctors have different specialties', async () => {
    serve({ s1: [THERAPIST], s2: [CARDIOLOGIST], s3: [CARDIOLOGIST] });
    renderStep();

    const therapy = await screen.findByTestId('service-group-419192003');
    const cardiology = screen.getByTestId('service-group-394579002');

    expect(within(therapy).getByRole('heading', { name: 'Терапия' })).toBeInTheDocument();
    expect(within(therapy).getAllByRole('button')).toHaveLength(1);
    expect(within(cardiology).getByRole('heading', { name: 'Кардиология' })).toBeInTheDocument();
    expect(within(cardiology).getAllByRole('button')).toHaveLength(2);
  });

  it('should put a service nobody gives into the closing group when its doctor list is empty', async () => {
    serve({ s1: [THERAPIST], s2: [CARDIOLOGIST] });
    renderStep();

    const other = await screen.findByTestId('service-group-other');

    expect(within(other).getByTestId('service-s3')).toBeInTheDocument();
    expect(within(other).getByRole('heading', { name: 'Другие услуги' })).toBeInTheDocument();
  });

  it('should draw no group headings when every service falls into one group', async () => {
    serve({ s1: [THERAPIST], s2: [THERAPIST], s3: [THERAPIST] });
    renderStep();

    await screen.findByTestId('service-s1');

    expect(screen.queryByTestId('service-group-419192003')).not.toBeInTheDocument();
  });

  it('should hide a description that only repeats the title and keep one that adds something', async () => {
    serve({ s1: [THERAPIST], s2: [THERAPIST], s3: [THERAPIST] });
    renderStep();
    await screen.findByTestId('service-s1');

    expect(screen.queryByText('Первичная консультация терапевта')).not.toBeInTheDocument();
    expect(screen.getByText('ЭКГ в покое с расшифровкой')).toBeInTheDocument();
  });

  it('should show the duration badge on every service', async () => {
    serve({ s1: [THERAPIST], s2: [THERAPIST], s3: [THERAPIST] });
    renderStep();
    await screen.findByTestId('service-s1');

    expect(within(screen.getByTestId('service-s1')).getByText('30 мин')).toBeInTheDocument();
  });

  it('should still list the services when a doctor read fails', async () => {
    apiFetchMock.mockImplementation((path) => (path.startsWith('/api/v1/services') ? Promise.resolve({ items: SERVICES, meta: META }) : Promise.reject(new Error('down'))));
    renderStep();

    expect(await screen.findByTestId('service-s1')).toBeInTheDocument();
  });
});
