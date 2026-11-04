import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSessionStore } from '@/store/use-session-store';
import { useUiStore } from '@/store/use-ui-store';
import { problem } from './doctor-test-utils';
import { PatientSummary } from './patient-summary';
import { useEncounter, usePatientHistory, usePatientPrescriptions, useUpcomingVisit } from './use-doctor-queries';

jest.mock('./use-doctor-queries');
jest.mock('./unit-label', () => ({ useUnitLabel: () => (unit: string) => unit }));

const PENDING = { data: undefined, isPending: true, isError: false, error: null, refetch: jest.fn() };
const EMPTY_PAGE = { items: [], meta: { page: 1, pageSize: 5, totalItems: 0, totalPages: 1 } };

describe('PatientSummary retries', () => {
  beforeEach(() => {
    useUiStore.setState({ locale: 'ru' });
    jest.mocked(usePatientHistory).mockReturnValue({ ...PENDING, data: EMPTY_PAGE, isPending: false } as never);
    jest.mocked(usePatientPrescriptions).mockReturnValue({ ...PENDING, data: EMPTY_PAGE, isPending: false } as never);
    jest.mocked(useEncounter).mockReturnValue({ ...PENDING, isPending: false } as never);
    jest.mocked(useUpcomingVisit).mockReturnValue({ ...PENDING, data: null, isPending: false } as never);
  });

  it('should offer a retry that asks for the next visit again when that read failed', async () => {
    const refetch = jest.fn();
    jest.mocked(useUpcomingVisit).mockReturnValue({ ...PENDING, data: undefined, isPending: false, isError: true, refetch } as never);
    render(<PatientSummary patientId="p1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('should offer a retry that asks for the history again when the last vitals could not be read', async () => {
    const refetch = jest.fn();
    jest.mocked(usePatientHistory).mockReturnValue({ ...PENDING, data: { ...EMPTY_PAGE }, isPending: false, isError: true, refetch } as never);
    render(<PatientSummary patientId="p1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('should say the last visit was held by another doctor instead of «no vitals» when the record answers 403', () => {
    useSessionStore.setState({ fhirUser: 'PractitionerRole/own' });
    jest.mocked(usePatientHistory).mockReturnValue({ ...PENDING, data: { ...EMPTY_PAGE, items: [{ id: 'e1', date: '2026-10-01T07:00:00Z', practitionerRoleId: 'own', diagnoses: [] }] }, isPending: false } as never);
    jest.mocked(useEncounter).mockReturnValue({ ...PENDING, isPending: false, isError: true, error: problem(403, 'COMPARTMENT_VIOLATION') } as never);
    render(<PatientSummary patientId="p1" />);

    expect(screen.getByText(/провёл другой врач/)).toBeInTheDocument();
    expect(screen.queryByText('Показателей пока нет')).not.toBeInTheDocument();
  });

  it('should not read the record of a colleague and should read the newest visit of the signed-in doctor', () => {
    useSessionStore.setState({ fhirUser: 'PractitionerRole/own' });
    const items = [
      { id: 'colleague-enc', date: '2026-10-05T07:00:00Z', practitionerRoleId: 'other', diagnoses: [] },
      { id: 'own-enc', date: '2026-10-01T07:00:00Z', practitionerRoleId: 'own', diagnoses: [] },
    ];
    jest.mocked(usePatientHistory).mockReturnValue({ ...PENDING, data: { ...EMPTY_PAGE, items }, isPending: false } as never);
    jest.mocked(useEncounter).mockReturnValue({ ...PENDING, isPending: false, data: { observations: [{ code: '1', codeSystem: 's', display: 'Температура', value: 36.6, unit: 'Cel' }] } } as never);
    render(<PatientSummary patientId="p1" />);

    expect(jest.mocked(useEncounter)).toHaveBeenCalledWith('own-enc', true);
    expect(screen.getByText('36,6 Cel')).toBeInTheDocument();
  });

  it('should offer a retry, not an empty block, when the record of the visit failed for another reason', async () => {
    const refetch = jest.fn();
    useSessionStore.setState({ fhirUser: 'PractitionerRole/own' });
    jest.mocked(usePatientHistory).mockReturnValue({ ...PENDING, data: { ...EMPTY_PAGE, items: [{ id: 'e1', date: '2026-10-01T07:00:00Z', practitionerRoleId: 'own', diagnoses: [] }] }, isPending: false } as never);
    jest.mocked(useEncounter).mockReturnValue({ ...PENDING, isPending: false, isError: true, error: problem(500, 'INTERNAL'), refetch } as never);
    render(<PatientSummary patientId="p1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
