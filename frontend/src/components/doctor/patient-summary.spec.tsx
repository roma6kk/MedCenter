import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useUiStore } from '@/store/use-ui-store';
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
});
