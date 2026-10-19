import { PatientShell } from '@/components/layout/patient-shell';
import { HistoryTimeline } from '@/components/patient/history-timeline';

export default function HistoryPage(): React.JSX.Element {
  return (
    <PatientShell>
      <HistoryTimeline />
    </PatientShell>
  );
}
