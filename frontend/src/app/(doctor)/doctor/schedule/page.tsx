'use client';
import { StaffShell, DOCTOR_LINKS } from '@/components/layout/staff-shell';
import { DoctorScheduleView } from '@/components/doctor/doctor-schedule-view';

export default function DoctorSchedulePage(): React.JSX.Element {
  return (
    <StaffShell links={DOCTOR_LINKS} title="Расписание">
      <h1 className="serif text-2xl font-bold">Моё расписание</h1>
      <div className="mt-4">
        <DoctorScheduleView />
      </div>
    </StaffShell>
  );
}
