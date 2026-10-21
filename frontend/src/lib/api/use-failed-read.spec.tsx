import { QueryClient, QueryClientProvider, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useFailedRead, type ReadFailure } from './use-failed-read';

function wrapperOf(client: QueryClient): (props: { readonly children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

interface Probe {
  readonly query: UseQueryResult<string>;
  readonly failure: ReadFailure | null;
}

function useProbe(queryKey: ReadonlyArray<string>, queryFn: () => Promise<string>): Probe {
  const query = useQuery({ queryKey, queryFn });
  return { query, failure: useFailedRead(query) };
}

describe('useFailedRead', () => {
  it('should report no failure when the first read is still loading', () => {
    const client = newClient();

    const { result } = renderHook(() => useProbe(['a'], () => new Promise<string>(() => undefined)), { wrapper: wrapperOf(client) });

    expect(result.current.failure).toBeNull();
  });

  it('should report the error when the read failed and has no data', async () => {
    const client = newClient();
    const boom = new Error('boom');

    const { result } = renderHook(() => useProbe(['a'], () => Promise.reject(boom)), { wrapper: wrapperOf(client) });

    await waitFor(() => expect(result.current.failure).toEqual({ error: boom, isRetrying: false }));
  });

  it('should keep the error on screen as retrying when the read is asked for again', async () => {
    const client = newClient();
    const boom = new Error('boom');
    const retry = jest.fn<Promise<string>, []>().mockRejectedValueOnce(boom).mockReturnValue(new Promise<string>(() => undefined));
    const { result } = renderHook(() => useProbe(['a'], retry), { wrapper: wrapperOf(client) });
    await waitFor(() => expect(result.current.failure?.isRetrying).toBe(false));

    act(() => {
      void result.current.query.refetch();
    });

    await waitFor(() => expect(result.current.query.isPending).toBe(true));
    expect(result.current.failure).toEqual({ error: boom, isRetrying: true });
  });

  it('should drop the failure when the retry brings data', async () => {
    const client = newClient();
    const retry = jest.fn<Promise<string>, []>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok');
    const { result } = renderHook(() => useProbe(['a'], retry), { wrapper: wrapperOf(client) });
    await waitFor(() => expect(result.current.failure?.isRetrying).toBe(false));

    await act(async () => {
      await result.current.query.refetch();
    });

    await waitFor(() => expect(result.current.query.data).toBe('ok'));
    expect(result.current.failure).toBeNull();
  });

  it('should show the new error when the retry fails again', async () => {
    const client = newClient();
    const second = new Error('again');
    const retry = jest.fn<Promise<string>, []>().mockRejectedValueOnce(new Error('first')).mockRejectedValue(second);
    const { result } = renderHook(() => useProbe(['a'], retry), { wrapper: wrapperOf(client) });
    await waitFor(() => expect(result.current.failure?.isRetrying).toBe(false));

    await act(async () => {
      await result.current.query.refetch();
    });

    await waitFor(() => expect(result.current.failure).toEqual({ error: second, isRetrying: false }));
  });

  it('should not carry the old error over when another query starts loading', async () => {
    const client = newClient();
    const pending = new Promise<string>(() => undefined);
    const { result, rerender } = renderHook(({ id }: { readonly id: string }) => useProbe([id], () => (id === 'a' ? Promise.reject(new Error('boom')) : pending)), {
      wrapper: wrapperOf(client),
      initialProps: { id: 'a' },
    });
    await waitFor(() => expect(result.current.failure?.isRetrying).toBe(false));

    rerender({ id: 'b' });

    expect(result.current.failure).toBeNull();
  });
});
