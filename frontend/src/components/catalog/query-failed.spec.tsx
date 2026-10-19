import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-fetch';
import { QueryFailed, QueryLoading } from './query-failed';

describe('QueryFailed', () => {
  it('should show the problem of the failed response, with its request id, when an API error is given', () => {
    const error = new ApiError({ title: 'Bad Gateway', status: 502, errorCode: 'INTERNAL', requestId: 'req-9' });
    render(<QueryFailed error={error} onRetry={jest.fn()} />);

    expect(screen.getByTestId('problem-banner')).toHaveTextContent('req-9');
  });

  it('should fall back to a generic internal error when the failure is not an API problem', () => {
    render(<QueryFailed error={new Error('boom')} onRetry={jest.fn()} />);

    expect(screen.getByTestId('problem-banner')).toBeInTheDocument();
  });

  it('should ask again when the visitor presses retry', async () => {
    const onRetry = jest.fn();
    render(<QueryFailed error={new Error('boom')} onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('QueryLoading', () => {
  it('should announce the loading state to assistive technology when a read is in flight', () => {
    render(<QueryLoading />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });
});
