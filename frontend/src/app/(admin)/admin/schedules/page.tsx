import { StaffShell, ADMIN_LINKS } from '@/components/layout/staff-shell';
import { ScheduleEditor } from '@/components/admin/schedule-editor';
import { SlotGenerationDialog } from '@/components/admin/slot-generation-dialog';

export default function AdminSchedulesPage(): React.JSX.Element {
  return (
    <StaffShell links={ADMIN_LINKS} title="Расписания">
      <h1 className="serif text-2xl font-bold">Расписания</h1>
      <div className="mt-4 grid gap-4">
        <ScheduleEditor />
        <SlotGenerationDialog scheduleId="default" />
      </div>
    </StaffShell>
  );
}
