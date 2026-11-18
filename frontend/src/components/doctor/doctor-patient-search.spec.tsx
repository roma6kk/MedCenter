import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '@/lib/api/api-fetch';
import { useUiStore } from '@/store/use-ui-store';
import { DoctorPatientSearch } from './doctor-patient-search';
import { appointment, callsTo, pageOf, problem, renderWithClient, routeApi, type ApiMock } from './doctor-test-utils';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as ApiMock;
const JOURNAL = '/api/v1/doctor/appointments';

function pageParam(path: string): number {
  return Number(new URL(path, 'http://x').searchParams.get('page'));
}

describe('DoctorPatientSearch', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useUiStore.setState({ locale: 'ru' });
  });

  it('should read every journal page, newest first, so a patient beyond the first page is found', async () => {
    routeApi(apiFetchMock, [
      {
        path: JOURNAL,
        respond: (path) =>
          pageParam(path) === 1
            ? pageOf([appointment({ id: 'a1', patientId: 'p1', patientName: 'Иванов Пётр', start: '2026-11-03T07:00:00Z' })], 1, 2)
            : pageOf([appointment({ id: 'a2', patientId: 'p2', patientName: 'Сидоров Олег', start: '2026-09-03T07:00:00Z' })], 2, 2),
      },
    ]);
    renderWithClient(<DoctorPatientSearch />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск пациента' }), 'сидоров');

    expect(await screen.findByRole('link', { name: /Сидоров Олег/ })).toBeInTheDocument();
    expect(callsTo(apiFetchMock, JOURNAL)).toHaveLength(2);
    expect(callsTo(apiFetchMock, JOURNAL)[0]?.[0]).toContain('sortOrder=desc');
  });

  it('should label a patient who has only a future visit with the next visit, not the last one', async () => {
    const future: string = new Date(Date.now() + 2 * 86_400_000).toISOString();
    routeApi(apiFetchMock, [{ path: JOURNAL, respond: () => pageOf([appointment({ id: 'a1', patientId: 'p1', patientName: 'Иванов Пётр', start: future })]) }]);
    renderWithClient(<DoctorPatientSearch />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск пациента' }), 'иванов');

    expect(await screen.findByText(/Ближайший приём:/)).toBeInTheDocument();
    expect(screen.queryByText(/Последний приём:/)).not.toBeInTheDocument();
  });

  it('should offer a retry when the search failed and show the results after it', async () => {
    let calls = 0;
    routeApi(apiFetchMock, [
      {
        path: JOURNAL,
        respond: () => {
          calls += 1;
          if (calls === 1) throw problem(500, 'INTERNAL');
          return pageOf([appointment({ id: 'a1', patientId: 'p1', patientName: 'Иванов Пётр', start: '2026-10-01T07:00:00Z' })]);
        },
      },
    ]);
    renderWithClient(<DoctorPatientSearch />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Поиск пациента' }), 'иванов');
    await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }));

    await waitFor(() => expect(screen.getByRole('link', { name: /Иванов Пётр/ })).toBeInTheDocument());
  });
});
