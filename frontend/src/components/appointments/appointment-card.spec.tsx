import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LONG_UNBROKEN_TEXT } from '@/components/patient/cabinet-fixtures';
import { expectWraps, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useUiStore } from '@/store/use-ui-store';
import { AppointmentCard } from './appointment-card';
import { appointmentFixture } from './appointment-fixtures';

const BEFORE_FIXTURE_START = '2026-10-15T00:00:00Z';

describe('AppointmentCard', () => {
  beforeEach(() => {
    resetCabinetState();
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(BEFORE_FIXTURE_START));
  });
  afterEach(() => jest.restoreAllMocks());

  it('should show the Minsk time, the doctor, the service and the status stamp', () => {
    render(<AppointmentCard appointment={appointmentFixture()} />);

    expect(screen.getByText(/10:00/)).toHaveAttribute('datetime', '2026-10-19T07:00:00.000Z');
    expect(screen.getByText('Иванова Мария Сергеевна')).toBeInTheDocument();
    expect(screen.getByText('Приём терапевта (первичный)')).toBeInTheDocument();
    expect(screen.getByTestId('stamp-booked')).toHaveTextContent('Записан');
  });

  it('should fall back to neutral texts when the doctor and the service names are missing', () => {
    render(<AppointmentCard appointment={appointmentFixture({ doctorName: undefined, serviceName: undefined })} />);

    expect(screen.getByText('Врач не указан')).toBeInTheDocument();
    expect(screen.getByText('Услуга не указана')).toBeInTheDocument();
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

  it('should not offer the cancel action once the appointment has started', () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-19T07:00:00Z'));
    render(<AppointmentCard appointment={appointmentFixture()} onCancel={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /Отменить запись:/ })).not.toBeInTheDocument();
  });

  it('should make the cancel action quiet red text with an icon next to «Подробнее», not a filled button (B2)', () => {
    render(<AppointmentCard appointment={appointmentFixture()} onCancel={jest.fn()} />);

    const cancel = screen.getByRole('button', { name: /Отменить запись:/ });

    expect(cancel).toHaveClass('text-destructive');
    expect(cancel).not.toHaveClass('bg-destructive');
    expect(cancel).not.toHaveClass('bg-destructive-soft');
    expect(cancel.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
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
    render(<AppointmentCard appointment={appointmentFixture({ status: 'cancelled', cancelReason: 'plans-changed' })} />);

    expect(screen.getByText('Причина отмены: Изменились планы')).toBeInTheDocument();
  });

  it('should show legacy free text as Другое and never print it', () => {
    render(<AppointmentCard appointment={appointmentFixture({ status: 'cancelled', cancelReason: 'Заболел, температура' })} />);

    expect(screen.getByText('Причина отмены: Другое')).toBeInTheDocument();
    expect(screen.queryByText(/температура/)).not.toBeInTheDocument();
  });

  it('should speak English when the locale is en', () => {
    useUiStore.setState({ locale: 'en' });
    render(<AppointmentCard appointment={appointmentFixture()} onCancel={jest.fn()} />);

    expect(screen.getByTestId('stamp-booked')).toHaveTextContent('Booked');
    expect(screen.getByRole('button', { name: /Cancel appointment: / })).toBeInTheDocument();
  });

  it('should let a long doctor or service name wrap too', () => {
    render(<AppointmentCard appointment={appointmentFixture({ serviceName: LONG_UNBROKEN_TEXT })} />);

    expectWraps(screen.getByText(LONG_UNBROKEN_TEXT, { exact: false }));
  });
});
