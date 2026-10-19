import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { COPIED_MESSAGE_MS, CopyRequestId } from './copy-request-id';

const REQUEST_ID = '3882171c-26eb-4417-a8aa-3281fde8c982';

function mockClipboard(writeText: jest.Mock): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('CopyRequestId', () => {
  it('should render a copy button for the request id when the id is not empty', () => {
    render(<CopyRequestId requestId={REQUEST_ID} />);

    expect(screen.getByTitle(REQUEST_ID)).toHaveTextContent('3882171c…');
    expect(screen.getByRole('button', { name: `Скопировать идентификатор запроса ${REQUEST_ID}` })).toBeInTheDocument();
  });

  it('should render a dash and no button when the request id is empty', () => {
    render(<CopyRequestId requestId="" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByTestId('no-request-id')).toBeInTheDocument();
  });

  it('should write the id to the clipboard and confirm when the button is pressed', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    render(<CopyRequestId requestId={REQUEST_ID} />);

    await userEvent.click(screen.getByRole('button'));

    expect(writeText).toHaveBeenCalledWith(REQUEST_ID);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Скопировано'));
  });

  it('should not claim success when the clipboard is denied', async () => {
    mockClipboard(jest.fn().mockRejectedValue(new Error('denied')));
    render(<CopyRequestId requestId={REQUEST_ID} />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should have no live region when nothing is copied yet, so a page of events has no empty regions', () => {
    render(<CopyRequestId requestId={REQUEST_ID} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should take the confirmation away after a while when the id was copied', async () => {
    jest.useFakeTimers();
    mockClipboard(jest.fn().mockResolvedValue(undefined));
    render(<CopyRequestId requestId={REQUEST_ID} />);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toHaveTextContent('Скопировано');
    act(() => {
      jest.advanceTimersByTime(COPIED_MESSAGE_MS);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    jest.useRealTimers();
  });
});
