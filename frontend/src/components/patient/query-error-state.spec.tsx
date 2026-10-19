import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem } from './cabinet-test-utils';
import { isMissingError, MutationProblem, QueryErrorState } from './query-error-state';
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

describe('MutationProblem', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should show the problem with its request id when the server answered', () => {
    render(<MutationProblem problem={{ title: 'INTERNAL', status: 500, errorCode: 'INTERNAL', requestId: 'req-60' }} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('req-60');
    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Внутренняя ошибка');
  });

  it('should say there is no connection, without the code of its stand-in, when no answer came', () => {
    render(<MutationProblem problem={{ title: 'INTERNAL', status: 0, errorCode: 'INTERNAL' }} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByTestId('code-chip')).not.toBeInTheDocument();
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
