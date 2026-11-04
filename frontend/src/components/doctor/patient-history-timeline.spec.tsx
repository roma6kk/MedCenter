import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import { PatientHistoryTimeline } from './patient-history-timeline';
import { usePatientHistory, useVisitPrescriptions } from './use-doctor-queries';

jest.mock('./use-doctor-queries');

const META = { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 };

function visit(id: string, practitionerRoleId: string, doctorName: string, diagnoses: ReadonlyArray<{ code: string; display: string }>) {
  return { id, date: '2026-10-01T07:00:00Z', status: 'finished', diagnosis: '', diagnoses, appointmentId: `ap-${id}`, practitionerRoleId, doctorName };
}

describe('PatientHistoryTimeline with two doctors', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
    useSessionStore.setState({ fhirUser: 'PractitionerRole/own' });
    const items = [visit('mine', 'own', 'Орлов А. Н.', [{ code: 'J06.9', display: 'ОРВИ' }, { code: 'J06.9', display: 'ОРВИ' }]), visit('theirs', 'other', 'Громова Е. В.', [])];
    jest.mocked(usePatientHistory).mockReturnValue({ data: { items, meta: META }, isPending: false, isError: false, isFetching: false } as never);
    jest.mocked(useVisitPrescriptions).mockReturnValue({ data: { items: [], meta: META } } as never);
  });

  it('should name the doctor of each visit and link only the visit of the signed-in doctor', async () => {
    render(<PatientHistoryTimeline patientId="p1" />);

    expect(screen.getByText('Врач: Орлов А. Н.')).toBeInTheDocument();
    expect(screen.getByText('Врач: Громова Е. В.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Открыть приём/ })).toHaveLength(1);

    await userEvent.click(screen.getAllByRole('button')[1] as HTMLElement);

    expect(screen.getByText('Приём другого врача')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Открыть приём/ })).toHaveLength(1);
  });

  it('should ask for the orders of an opened visit by the id of that visit and list what comes back', async () => {
    jest.mocked(useVisitPrescriptions).mockReturnValue({ data: { items: [{ id: 'o1', kind: 'medication', atcCode: 'J01FA10', atcDisplay: 'Азитромицин', dosageText: '500 мг', encounterId: 'mine' }], meta: META } } as never);
    jest.mocked(useVisitPrescriptions).mockClear();
    render(<PatientHistoryTimeline patientId="p1" />);

    expect(useVisitPrescriptions).toHaveBeenCalledWith('p1', 'mine');
    expect(useVisitPrescriptions).not.toHaveBeenCalledWith('p1', 'theirs');
    expect(screen.getByText('Азитромицин — 500 мг')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button')[1] as HTMLElement);

    expect(useVisitPrescriptions).toHaveBeenCalledWith('p1', 'theirs');
  });
});
