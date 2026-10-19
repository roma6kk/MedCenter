jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from '@/lib/api/api-fetch';
import { findFinishedEncounterId } from './find-finished-encounter';
import { routeApi, type ApiMock } from './doctor-test-utils';

const apiFetchMock = apiFetch as ApiMock;

function historyPage(items: ReadonlyArray<{ id: string; appointmentId: string }>, page: number, totalPages: number): unknown {
  return { items, meta: { page, pageSize: 100, totalItems: items.length, totalPages } };
}

describe('findFinishedEncounterId', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should return the encounter id of the appointment when the history lists it', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/patients/p1/history', respond: () => historyPage([{ id: 'e1', appointmentId: 'a1' }, { id: 'e2', appointmentId: 'a2' }], 1, 1) }]);

    await expect(findFinishedEncounterId('p1', 'a2')).resolves.toBe('e2');
  });

  it('should return null when no visit of the history belongs to the appointment', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/patients/p1/history', respond: () => historyPage([{ id: 'e1', appointmentId: 'a1' }], 1, 1) }]);

    await expect(findFinishedEncounterId('p1', 'a9')).resolves.toBeNull();
  });

  it('should look at the next page when the first one does not hold the appointment', async () => {
    routeApi(apiFetchMock, [
      {
        path: '/api/v1/patients/p1/history',
        respond: (path) => (path.includes('page=2') ? historyPage([{ id: 'e7', appointmentId: 'a7' }], 2, 2) : historyPage([{ id: 'e1', appointmentId: 'a1' }], 1, 2)),
      },
    ]);

    await expect(findFinishedEncounterId('p1', 'a7')).resolves.toBe('e7');
  });

  it('should send the patient id percent-encoded when it contains reserved characters', async () => {
    routeApi(apiFetchMock, [{ path: '/api/v1/patients/', respond: () => historyPage([], 1, 1) }]);

    await findFinishedEncounterId('a/b', 'a1');

    expect(apiFetchMock.mock.calls[0]?.[0]).toContain('/api/v1/patients/a%2Fb/history');
  });
});
