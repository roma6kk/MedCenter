import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '@/store/use-ui-store';
import { ConsentRequiredNotice } from './consent-required-notice';

function renderNotice(overrides: Partial<React.ComponentProps<typeof ConsentRequiredNotice>> = {}): jest.Mock {
  const onEmergency = jest.fn();
  render(<ConsentRequiredNotice action="open" patientId="p1" isPending={false} onEmergency={onEmergency} {...overrides} />);
  return onEmergency;
}

describe('ConsentRequiredNotice', () => {
  beforeEach(() => useUiStore.setState({ locale: 'ru' }));

  it('should say the encounter cannot be opened, send the patient to the front desk and link to the record form', () => {
    renderNotice();

    expect(screen.getByRole('alert')).toHaveTextContent('Нет согласия на электронную медкарту');
    expect(screen.getByText('Приём нельзя открыть: у пациента нет действующего согласия.')).toBeInTheDocument();
    expect(screen.getByText(/Отправьте пациента в регистратуру оформить согласие/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Внести согласие в карточке пациента' })).toHaveAttribute('href', '/patients/p1#consent');
  });

  it('should say the encounter cannot be completed when completing was refused', () => {
    renderNotice({ action: 'complete' });

    expect(screen.getByText('Приём нельзя завершить: у пациента нет действующего согласия.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Завершить приём как экстренный' })).toBeInTheDocument();
  });

  it('should explain that emergency care goes into the audit log and name what the button does', () => {
    renderNotice();

    expect(screen.getByText(/попадут в журнал аудита|будут записаны в журнал аудита/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть приём как экстренный' })).toBeInTheDocument();
  });

  it.each([
    ['empty', '', 'Опишите причину подробнее: не меньше 10 символов'],
    ['shorter than 10 characters', 'Без созна', 'Опишите причину подробнее: не меньше 10 символов'],
    ['longer than 500 characters', 'я'.repeat(501), 'Не больше 500 символов'],
  ])('should not send an emergency reason that is %s', async (_name, reason, message) => {
    const onEmergency = renderNotice();

    await userEvent.click(screen.getByLabelText('Причина экстренной помощи'));
    await userEvent.paste(reason);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть приём как экстренный' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Причина экстренной помощи')).toHaveAttribute('aria-invalid', 'true');
    expect(onEmergency).not.toHaveBeenCalled();
  });

  it('should count blanks around the reason as nothing', async () => {
    const onEmergency = renderNotice();

    await userEvent.click(screen.getByLabelText('Причина экстренной помощи'));
    await userEvent.paste('   ab   ');
    await userEvent.click(screen.getByRole('button', { name: 'Открыть приём как экстренный' }));

    expect(onEmergency).not.toHaveBeenCalled();
  });

  it('should send the trimmed reason when it is 10 to 500 characters', async () => {
    const onEmergency = renderNotice();

    await userEvent.click(screen.getByLabelText('Причина экстренной помощи'));
    await userEvent.paste('  Пациент без сознания, ДТП  ');
    await userEvent.click(screen.getByRole('button', { name: 'Открыть приём как экстренный' }));

    expect(onEmergency).toHaveBeenCalledTimes(1);
    expect(onEmergency).toHaveBeenCalledWith('Пациент без сознания, ДТП');
  });

  it('should keep the button focusable and send nothing while the emergency request runs', async () => {
    const onEmergency = renderNotice({ isPending: true });

    await userEvent.click(screen.getByLabelText('Причина экстренной помощи'));
    await userEvent.paste('Пациент без сознания, ДТП');
    const busy = screen.getByRole('button', { name: 'Отправляем…' });
    await userEvent.click(busy);

    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(onEmergency).not.toHaveBeenCalled();
  });
});
