import { act, renderHook } from '@testing-library/react';
import { parsePage, useUrlState, writeUrlQuery } from './use-url-state';

jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

const DEFAULTS = { tab: 'upcoming', page: '1' };

describe('useUrlState', () => {
  beforeEach(() => window.history.replaceState(null, '', '/appointments'));

  it('should start from the defaults when the address has no query', () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS));

    expect(result.current[0]).toEqual({ tab: 'upcoming', page: '1' });
  });

  it('should start from the values in the address', () => {
    window.history.replaceState(null, '', '/appointments?tab=all&page=3');

    const { result } = renderHook(() => useUrlState(DEFAULTS));

    expect(result.current[0]).toEqual({ tab: 'all', page: '3' });
  });

  it('should write a changed value to the address and leave the defaults out', () => {
    const { result } = renderHook(() => useUrlState(DEFAULTS));

    act(() => result.current[1]({ tab: 'all', page: '2' }));
    expect(window.location.pathname + window.location.search).toBe('/appointments?tab=all&page=2');
    expect(result.current[0]).toEqual({ tab: 'all', page: '2' });

    act(() => result.current[1]({ tab: 'upcoming', page: '1' }));
    expect(window.location.pathname + window.location.search).toBe('/appointments');
  });
});

describe('parsePage', () => {
  it.each([['3', 3], ['0', 1], ['-2', 1], ['x', 1], ['1.5', 1], ['', 1]])('should read %s as page %s', (raw, page) => {
    expect(parsePage(raw)).toBe(page);
  });
});

describe('writeUrlQuery', () => {
  it('should keep the path and replace the query', () => {
    window.history.replaceState(null, '', '/admin/audit?type=auth');

    writeUrlQuery('type=read');

    expect(window.location.search).toBe('?type=read');
  });
});
