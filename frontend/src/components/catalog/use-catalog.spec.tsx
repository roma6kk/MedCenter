import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from '@/lib/api/api-fetch';
import { useServices } from './use-catalog';

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string) => Promise<unknown>>;
const META = { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 };

function wrapperFor(client: QueryClient): (props: { readonly children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('catalog cache lifetime (C1)', () => {
  beforeEach(() => apiFetchMock.mockReset());

  it('should read an empty catalog again on the next mount, because an empty list is never fresh', async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [], meta: META }).mockResolvedValueOnce({ items: [{ id: 's1' }], meta: META });
    const client = new QueryClient();
    const first = renderHook(() => useServices(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.data?.items).toEqual([]));
    first.unmount();

    const second = renderHook(() => useServices(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(second.result.current.data?.items).toHaveLength(1));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('should not read a filled catalog again on the next mount while it is fresh', async () => {
    apiFetchMock.mockResolvedValue({ items: [{ id: 's1' }], meta: META });
    const client = new QueryClient();
    const first = renderHook(() => useServices(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.data?.items).toHaveLength(1));
    first.unmount();

    renderHook(() => useServices(), { wrapper: wrapperFor(client) });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
