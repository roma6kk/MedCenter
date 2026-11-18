import { apiFetch } from '@/lib/api/api-fetch';
import { JOURNAL_SCAN_MAX_PAGES, fetchJournalScan } from './doctor-api';
import { appointment, pageOf, type ApiMock } from './doctor-test-utils';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as ApiMock;
const RANGE = { from: '2026-11-04T00:00:00+03:00', to: '2026-12-04T23:59:59+03:00' };

describe('fetchJournalScan', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should walk to the last page the server reports and merge the rows', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      const page = Number(new URL(path, 'http://x').searchParams.get('page'));
      return Promise.resolve(pageOf([appointment({ id: `a${page}` })], page, 3));
    });

    const scan = await fetchJournalScan(RANGE, {});

    expect(scan.items.map((item) => item.id)).toEqual(['a1', 'a2', 'a3']);
    expect(scan.truncated).toBe(false);
  });

  it('should stop at the first page that satisfies the caller', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      const page = Number(new URL(path, 'http://x').searchParams.get('page'));
      return Promise.resolve(pageOf([appointment({ id: `a${page}` })], page, 5));
    });

    const scan = await fetchJournalScan(RANGE, { until: (items) => items.some((item) => item.id === 'a2') });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(scan.truncated).toBe(false);
  });

  it('should report a truncated scan when the page cap is reached before the last page', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      const page = Number(new URL(path, 'http://x').searchParams.get('page'));
      return Promise.resolve(pageOf([appointment({ id: `a${page}` })], page, 99));
    });

    const scan = await fetchJournalScan(RANGE, {});

    expect(apiFetchMock).toHaveBeenCalledTimes(JOURNAL_SCAN_MAX_PAGES);
    expect(scan.truncated).toBe(true);
  });
});
