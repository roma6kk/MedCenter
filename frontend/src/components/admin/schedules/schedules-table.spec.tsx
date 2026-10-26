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

  it('should offer neither edit nor generate for an inactive schedule', async () => {
    renderTable({ ...schedule, isActive: false });

    expect(screen.queryByRole('button', { name: /Сгенерировать слоты/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Действия:/ })[0]!);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Слоты', 'Удалить']);
  });
});
