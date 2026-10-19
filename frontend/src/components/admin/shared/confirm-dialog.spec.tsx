import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseMutationResult } from '@tanstack/react-query';
import { ConfirmDialog } from './confirm-dialog';
import { DeleteConfirm } from './delete-confirm';
import { apiProblem } from './test-utils';

const baseProps = { title: 'Удаление кабинета', message: 'Удалить кабинет?', confirmLabel: 'Удалить', isPending: false, onConfirm: jest.fn(), onCancel: jest.fn() };

describe('ConfirmDialog', () => {
  it('should call onConfirm when the confirm button is pressed', async () => {
    const onConfirm = jest.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should ignore clicks but keep the focus on the confirm button when the request is running', async () => {
    const onConfirm = jest.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} isPending />);
    const button = screen.getByRole('button', { name: 'Загрузка…' });
    button.focus();

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should keep the confirm button closed and count the seconds when the server answers 429 with Retry-After', async () => {
    const onConfirm = jest.fn();
    const error = apiProblem({ status: 429, errorCode: 'RATE_LIMITED', retryAfter: 7 });
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} error={error} />);

    await userEvent.click(screen.getByRole('button', { name: 'Повторите через 7 с.' }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('should explain a 409 ROOM_IN_USE inside the dialog and keep it open when the server refuses', () => {
    const error = apiProblem({ status: 409, errorCode: 'ROOM_IN_USE', detail: 'ROOM_IN_USE: room 7 is referenced by a schedule' });
    render(<ConfirmDialog {...baseProps} error={error} />);

    expect(screen.getByRole('dialog', { name: 'Удаление кабинета' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Кабинет используется в расписаниях');
    expect(screen.getByRole('alert')).toHaveTextContent('Откройте «Занятость»');
  });
});

describe('DeleteConfirm', () => {
  function mutationOf(partial: Partial<UseMutationResult<unknown, Error, string>>): UseMutationResult<unknown, Error, string> {
    return { isPending: false, error: null, mutate: jest.fn(), ...partial } as unknown as UseMutationResult<unknown, Error, string>;
  }

  it('should delete the target and close when the deletion succeeds', async () => {
    const onClose = jest.fn();
    const mutate = jest.fn((_id: string, options?: { onSuccess?: () => void }): void => options?.onSuccess?.());
    render(<DeleteConfirm title="T" message="M" confirmLabel="Удалить" targetId="room-1" mutation={mutationOf({ mutate: mutate as unknown as UseMutationResult<unknown, Error, string>['mutate'] })} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(mutate).toHaveBeenCalledWith('room-1', expect.objectContaining({ onSuccess: onClose }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should stay open and show the refusal when the deletion fails', () => {
    const error = apiProblem({ status: 409, errorCode: 'SERVICE_IN_USE', detail: 'SERVICE_IN_USE: service 1 is referenced by a schedule' });
    render(<DeleteConfirm title="T" message="M" confirmLabel="Удалить" targetId="s1" mutation={mutationOf({ error })} onClose={jest.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Услугу нельзя удалить');
  });
});
