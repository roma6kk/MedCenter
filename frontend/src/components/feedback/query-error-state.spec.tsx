import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { apiProblem } from '@/components/patient/cabinet-test-utils';
import { isMissingError, QueryErrorState, QueryFailure } from './query-error-state';
import { useUiStore } from '@/store/use-ui-store';

describe('QueryErrorState', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should show the not-found screen when the service answers 404', () => {
    render(<QueryErrorState error={apiProblem(404, 'NOT_FOUND')} notFoundText="Запись не найдена" />);

    expect(screen.getByTestId('not-found-state')).toHaveTextContent('Запись не найдена');
  });

  it('should show the same not-found screen when the record belongs to another patient (BR-006)', () => {
    render(<QueryErrorState error={apiProblem(403, 'COMPARTMENT_VIOLATION')} notFoundText="Запись не найдена" />);

    expect(screen.getByTestId('not-found-state')).toBeInTheDocument();
    expect(screen.queryByTestId('forbidden-state')).not.toBeInTheDocument();
  });

  it('should treat a malformed id as not found only when the page asks for it', () => {
    const error = apiProblem(400, 'VALIDATION_ERROR');
    const { rerender } = render(<QueryErrorState error={error} notFoundText="Запись не найдена" badRequestIsNotFound />);
    expect(screen.getByTestId('not-found-state')).toBeInTheDocument();

    rerender(<QueryErrorState error={error} notFoundText="Запись не найдена" />);
    expect(screen.getByTestId('problem-banner')).toBeInTheDocument();
  });

  it('should show the forbidden screen when the role or scope is not allowed', () => {
    render(<QueryErrorState error={apiProblem(403, 'FORBIDDEN_ROLE')} notFoundText="Запись не найдена" />);

    expect(screen.getByTestId('forbidden-state')).toBeInTheDocument();
  });

  it('should show a banner with the request id and a retry button when the service fails', async () => {
    const onRetry = jest.fn();
    render(<QueryErrorState error={apiProblem(500, 'INTERNAL', { requestId: 'req-42' })} notFoundText="x" onRetry={onRetry} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('req-42');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should say the server cannot be reached, without an error code, when the connection is lost', () => {
    render(<QueryErrorState error={apiProblem(0, 'INTERNAL')} notFoundText="x" onRetry={jest.fn()} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByTestId('code-chip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('should fall back to the internal-error banner when the failure is not an ApiError', () => {
    render(<QueryErrorState error={new Error('boom')} notFoundText="x" />);

    expect(screen.getByTestId('problem-banner')).toBeInTheDocument();
  });
});

describe('QueryErrorState (embedded)', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should show a banner with the request id and a retry, not a screen with its own heading, when the record is missing', async () => {
    const onRetry = jest.fn();
    render(<QueryErrorState error={apiProblem(404, 'NOT_FOUND', { requestId: 'req-50' })} embedded onRetry={onRetry} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('req-50');
    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не найдено');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should not tell a foreign record from a missing one (BR-006) when it is embedded', () => {
    render(<QueryErrorState error={apiProblem(403, 'COMPARTMENT_VIOLATION')} embedded />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Не найдено');
    expect(screen.queryByTestId('code-chip')).toHaveTextContent('NOT_FOUND');
  });

  it('should show the forbidden problem as a banner, without a heading, when the role or scope is not allowed', () => {
    render(<QueryErrorState error={apiProblem(403, 'FORBIDDEN_ROLE')} embedded />);

    expect(screen.getByTestId('problem-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('forbidden-state')).not.toBeInTheDocument();
  });

  it('should still say the server cannot be reached when the connection is lost', () => {
    render(<QueryErrorState error={apiProblem(0, 'INTERNAL')} embedded />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Нет связи с сервером');
  });
});

describe('QueryErrorState (page)', () => {
  it('should fall back to the generic not-found text when the page gives none', () => {
    render(<QueryErrorState error={apiProblem(404, 'NOT_FOUND')} />);

    expect(screen.getByTestId('not-found-state')).toHaveTextContent('Не найдено');
  });
});

describe('isMissingError', () => {
  it.each([
    ['a 404', apiProblem(404, 'NOT_FOUND'), false, true],
    ['a foreign record', apiProblem(403, 'COMPARTMENT_VIOLATION'), false, true],
    ['a malformed id when asked', apiProblem(400, 'VALIDATION_ERROR'), true, true],
    ['a malformed id when not asked', apiProblem(400, 'VALIDATION_ERROR'), false, false],
    ['a server failure', apiProblem(500, 'INTERNAL'), true, false],
    ['a plain Error', new Error('boom'), true, false],
  ])('should classify %s correctly', (_name, error, badRequestIsNotFound, expected) => {
    expect(isMissingError(error, badRequestIsNotFound)).toBe(expected);
  });
});

describe('QueryErrorState while the read is repeated', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should keep the banner and close the button, saying it retries, when isRetrying is set', () => {
    render(<QueryErrorState error={apiProblem(500, 'INTERNAL', { requestId: 'req-70' })} isRetrying onRetry={jest.fn()} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('req-70');
    expect(screen.getByRole('button', { name: 'Повторяем…' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByRole('status').map((region) => region.textContent)).toContain('Повторяем…');
  });

  it('should ignore a click on the closed button when the read is already being repeated', async () => {
    const onRetry = jest.fn();
    render(<QueryErrorState error={apiProblem(500, 'INTERNAL')} isRetrying onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Повторяем…' }));

    expect(onRetry).not.toHaveBeenCalled();
  });

  it('should offer a retry button for an error that did not come from the API when a retry is wired', async () => {
    const onRetry = jest.fn();
    render(<QueryErrorState error={new Error('boom')} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should keep the button closed and count the seconds when the service answered 429', () => {
    render(<QueryErrorState error={apiProblem(429, 'RATE_LIMITED', { retryAfter: 7 })} onRetry={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Повторите через 7 с.' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('QueryFailure', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  interface HarnessProps {
    readonly fetcher: () => Promise<string>;
  }

  function Harness({ fetcher }: HarnessProps): ReactNode {
    const query = useQuery({ queryKey: ['failure-harness'], queryFn: fetcher });
    return (
      <main tabIndex={-1} data-testid="region">
        {query.data === undefined ? <QueryFailure query={query} embedded pending={<p>loading</p>} /> : <p>{query.data}</p>}
      </main>
    );
  }

  function renderHarness(fetcher: () => Promise<string>): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Harness fetcher={fetcher} /></QueryClientProvider>);
  }

  it('should show the pending content when the read is loading for the first time', () => {
    renderHarness(() => new Promise<string>(() => undefined));

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('should keep the banner and the focus on the button when the retry is in flight', async () => {
    const fetcher = jest.fn<Promise<string>, []>().mockRejectedValueOnce(apiProblem(500, 'INTERNAL')).mockReturnValue(new Promise<string>(() => undefined));
    renderHarness(fetcher);
    await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }));

    const button = await screen.findByRole('button', { name: 'Повторяем…' });

    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('problem-banner')).toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('should show the data and give focus to the surrounding region when the retry succeeds', async () => {
    const fetcher = jest.fn<Promise<string>, []>().mockRejectedValueOnce(apiProblem(500, 'INTERNAL')).mockResolvedValue('the list');
    renderHarness(fetcher);
    await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('the list')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('region')).toHaveFocus());
  });

  it('should show the banner again with an open button when the retry fails too', async () => {
    const fetcher = jest.fn<Promise<string>, []>().mockRejectedValue(apiProblem(503, 'INTERNAL'));
    renderHarness(fetcher);
    await userEvent.click(await screen.findByRole('button', { name: 'Повторить' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    const button = await screen.findByRole('button', { name: 'Повторить' });
    expect(button).not.toHaveAttribute('aria-disabled');
    await act(async () => undefined);
  });
});

