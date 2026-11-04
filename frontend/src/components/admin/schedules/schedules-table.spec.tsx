import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminSchedule } from './schedule-types';
import { SchedulesTable } from './schedules-table';
import type { SchedulePickers } from './use-schedule-pickers';

const meta = { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 };
const pickers = { allDoctors: [], rooms: [], services: [] } as unknown as SchedulePickers;
const schedule: AdminSchedule = { id: 's1', practitionerRoleId: 'role-1', roomId: 'r1', serviceId: 'svc', windows: [], isActive: true } as unknown as AdminSchedule;

function renderTable(row: AdminSchedule, handlers: Partial<Record<'onSlots' | 'onGenerate' | 'onEdit' | 'onDelete', jest.Mock>> = {}): void {
  render(<SchedulesTable rows={[row]} meta={meta} pickers={pickers} onPage={jest.fn()} onSlots={jest.fn()} onGenerate={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} {...handlers} />);
}

describe('SchedulesTable', () => {
  it('should keep «Сгенерировать слоты» as a visible secondary button and the rest in the menu (D3)', async () => {
    const onGenerate = jest.fn();
    renderTable(schedule, { onGenerate });

    await userEvent.click(screen.getAllByRole('button', { name: /Сгенерировать слоты/ })[0]!);
    expect(onGenerate).toHaveBeenCalledWith(schedule);

    expect(screen.queryByRole('button', { name: /^Удалить/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Действия:/ })[0]!);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Изменить', 'Слоты', 'Удалить']);
  });

  it('should make delete the red last item of the menu', async () => {
    const onDelete = jest.fn();
    renderTable(schedule, { onDelete });

    await userEvent.click(screen.getAllByRole('button', { name: /^Действия:/ })[0]!);
    const remove = screen.getByRole('menuitem', { name: 'Удалить' });
    await userEvent.click(remove);

    expect(remove).toHaveClass('text-destructive');
    expect(onDelete).toHaveBeenCalledWith(schedule);
  });

  it('should offer only the slots for an inactive schedule, a second delete changes nothing', async () => {
    renderTable({ ...schedule, isActive: false });

    expect(screen.queryByRole('button', { name: /Сгенерировать слоты/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Действия:/ })[0]!);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Слоты']);
  });

  it('should keep «Сгенерировать слоты» on one line (D3)', () => {
    renderTable(schedule);

    expect(screen.getAllByRole('button', { name: /Сгенерировать слоты/ })[0]).toHaveClass('whitespace-nowrap');
  });

  it('should write the windows in words with the slot length under them, and the horizon on one line with the year once', () => {
    const planned: AdminSchedule = {
      ...schedule,
      horizonFrom: '2026-10-26',
      horizonTo: '2026-11-08',
      slotDurationMin: 30,
      windows: ['MO', 'TU', 'WE', 'TH', 'FR'].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '13:00' })) as AdminSchedule['windows'],
    };
    renderTable(planned);

    expect(screen.getAllByText('Пн–Пт 09:00–13:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Слот 30 мин').length).toBeGreaterThan(0);
    expect(screen.getAllByText('26.10 – 08.11.2026')[0]).toHaveClass('whitespace-nowrap');
  });
});

