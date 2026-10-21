import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProblemDetails } from '@/lib/api/problem';
import { useUiStore } from '@/store/use-ui-store';
import { ProblemBanner } from './problem-banner';

const CONFLICT: ProblemDetails = {
  title: 'Slot conflict',
  status: 409,
  detail: 'Slot 7c9e is busy',
  errorCode: 'SLOT_CONFLICT',
  requestId: '01J9ZK3M8Q',
};

describe('ProblemBanner', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
  });

  it('should headline a problem with the localized errors.<code> text, not the English server title', () => {
    render(<ProblemBanner problem={CONFLICT} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Слот уже занят');
    expect(screen.queryByText('Slot conflict')).not.toBeInTheDocument();
  });

  it('should show the server detail, the code chip and the request id', () => {
    render(<ProblemBanner problem={CONFLICT} />);

    expect(screen.getByText('Slot 7c9e is busy')).toBeInTheDocument();
    expect(screen.getByTestId('code-chip')).toHaveTextContent('SLOT_CONFLICT');
    expect(screen.getByTestId('copy-request-id')).toHaveTextContent('01J9ZK3M8Q');
  });

  it('should render the three in-use codes with their own messages', () => {
    const { rerender } = render(<ProblemBanner problem={{ ...CONFLICT, errorCode: 'ROOM_IN_USE' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Кабинет используется в расписаниях');

    rerender(<ProblemBanner problem={{ ...CONFLICT, errorCode: 'SERVICE_IN_USE' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Услуга используется');

    rerender(<ProblemBanner problem={{ ...CONFLICT, errorCode: 'SCHEDULE_IN_USE' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Расписание используется');
  });

  it('should keep working with the explicit title/detail props the pages already pass', () => {
    render(<ProblemBanner title="Что-то пошло не так" detail="Повторите позже" errorCode="INTERNAL" />);

    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(screen.getByText('Повторите позже')).toBeInTheDocument();
  });

  it('should not repeat the joined field messages when the form shows them next to the inputs', () => {
    render(
      <ProblemBanner
        problem={{ title: 'BadRequestException', status: 400, errorCode: 'VALIDATION_ERROR', detail: 'email: email must be an email', details: [{ field: 'email', message: 'email must be an email' }] }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Проверьте заполнение полей');
    expect(screen.queryByText('email: email must be an email')).not.toBeInTheDocument();
  });

  it('should tell the user how long to wait after a 429 with Retry-After', () => {
    render(<ProblemBanner problem={{ title: 'Too many', status: 429, errorCode: 'RATE_LIMITED', retryAfter: 30 }} />);

    expect(screen.getByText('Повторите через 30 с.')).toBeInTheDocument();
  });

  it('should copy the request id and confirm it in a live region', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ProblemBanner problem={CONFLICT} />);

    await userEvent.click(screen.getByRole('button', { name: 'Скопировать идентификатор запроса 01J9ZK3M8Q' }));

    expect(writeText).toHaveBeenCalledWith('01J9ZK3M8Q');
    expect(await screen.findByText('Скопировано')).toBeInTheDocument();
  });

  it('should not claim "copied" when the clipboard is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    render(<ProblemBanner problem={CONFLICT} />);

    await userEvent.click(screen.getByTestId('copy-request-id'));

    expect(screen.queryByText('Скопировано')).not.toBeInTheDocument();
  });

  it('should localize to English', () => {
    useUiStore.setState({ locale: 'en' });

    render(<ProblemBanner problem={CONFLICT} />);

    expect(screen.getByRole('alert')).toHaveTextContent('The slot is already taken');
  });

  describe('when the request never got an answer', () => {
    const OFFLINE: ProblemDetails = { title: 'Нет связи с сервером', status: 0, errorCode: 'INTERNAL' };

    it('should say there is no connection and not "Internal error" when the problem has status 0', () => {
      render(<ProblemBanner problem={OFFLINE} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Нет связи с сервером');
      expect(screen.getByRole('alert')).not.toHaveTextContent('Внутренняя ошибка');
    });

    it('should show no INTERNAL code chip when the problem has status 0', () => {
      render(<ProblemBanner problem={OFFLINE} />);

      expect(screen.queryByTestId('code-chip')).not.toBeInTheDocument();
    });

    it('should say the server cannot be reached in English when the interface is English', () => {
      useUiStore.setState({ locale: 'en' });

      render(<ProblemBanner problem={OFFLINE} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server');
    });

    it('should keep the INTERNAL chip when the server really answered 500', () => {
      render(<ProblemBanner problem={{ title: 'Internal', status: 500, errorCode: 'INTERNAL', requestId: 'req-1' }} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Внутренняя ошибка');
      expect(screen.getByTestId('code-chip')).toHaveTextContent('INTERNAL');
    });
  });
});
