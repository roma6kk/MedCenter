import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LONG_UNBROKEN_TEXT } from '@/components/patient/cabinet-fixtures';
import { expectWraps, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useUiStore } from '@/store/use-ui-store';
import { AppointmentCard } from './appointment-card';
import { appointmentFixture } from './appointment-fixtures';

describe('AppointmentCard', () => {
  beforeEach(resetCabinetState);

  it('should show the Minsk time, the doctor, the service and the status stamp', () => {
    render(<AppointmentCard appointment={appointmentFixture()} />);

    expect(screen.getByText(/10:00/)).toHaveAttribute('datetime', '2026-10-19T07:00:00.000Z');
    expect(screen.getByText('Иванова Мария Сергеевна · Приём терапевта (первичный)')).toBeInTheDocument();
    expect(screen.getByTestId('stamp-booked')).toHaveTextContent('Записан');
  });

  it('should fall back to neutral texts when the doctor and the service names are missing', () => {
    render(<AppointmentCard appointment={appointmentFixture({ doctorName: undefined, serviceName: undefined })} />);

    expect(screen.getByText('Врач не указан · Услуга не указана')).toBeInTheDocument();
  });

  it('should link to the detail page with a name that tells the cards apart', () => {
    render(<AppointmentCard appointment={appointmentFixture()} />);

    const link = screen.getByRole('link', { name: /Подробнее о записи: .*10:00/ });

    expect(link).toHaveAttribute('href', '/appointments/1552');
  });

  it('should offer the cancel action for a booked appointment and report which one was chosen', async () => {
    const onCancel = jest.fn();
    const appointment = appointmentFixture();
    render(<AppointmentCard appointment={appointment} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /Отменить запись: .*Иванова Мария Сергеевна/ }));

    expect(onCancel).toHaveBeenCalledWith(appointment);
  });

  it.each(['cancelled', 'noshow', 'fulfilled'] as const)('should not offer the cancel action when the appointment is %s (BR-002)', (status) => {
    render(<AppointmentCard appointment={appointmentFixture({ status })} onCancel={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /Отменить запись/ })).not.toBeInTheDocument();
  });

  it('should not offer the cancel action when the parent gives no handler', () => {
    render(<AppointmentCard appointment={appointmentFixture()} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should show why a cancelled appointment was cancelled', () => {
    render(<AppointmentCard appointment={appointmentFixture({ status: 'cancelled', cancelReason: 'Заболел' })} />);

    expect(screen.getByText('Причина отмены: Заболел')).toBeInTheDocument();
  });

  it('should speak English when the locale is en', () => {
    useUiStore.setState({ locale: 'en' });
    render(<AppointmentCard appointment={appointmentFixture()} onCancel={jest.fn()} />);

    expect(screen.getByTestId('stamp-booked')).toHaveTextContent('Booked');
    expect(screen.getByRole('button', { name: /Cancel appointment: / })).toBeInTheDocument();
  });

  it('should let a cancellation reason without spaces wrap so the buttons and the stamp stay on screen', () => {
    render(<AppointmentCard appointment={appointmentFixture({ status: 'cancelled', cancelReason: LONG_UNBROKEN_TEXT })} />);

    expectWraps(screen.getByText(LONG_UNBROKEN_TEXT, { exact: false }));
    expect(screen.getByRole('link', { name: /Подробнее о записи/ })).toBeInTheDocument();
  });

  it('should let a long doctor or service name wrap too', () => {
    render(<AppointmentCard appointment={appointmentFixture({ serviceName: LONG_UNBROKEN_TEXT })} />);

    expectWraps(screen.getByText(LONG_UNBROKEN_TEXT, { exact: false }));
  });
});
