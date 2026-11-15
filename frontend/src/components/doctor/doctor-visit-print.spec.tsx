import { render, screen } from '@testing-library/react';
import { useUiStore } from '@/store/use-ui-store';
import { DoctorVisitPrint } from './doctor-visit-print';
import type { HistoryItem } from './doctor-types';
import { usePatient, useVisitPrescriptions } from './use-doctor-queries';

jest.mock('./use-doctor-queries');

const META = { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 };
const ITEM = { id: 'v1', date: '2026-10-01T07:00:00Z', status: 'finished', diagnosis: '', diagnoses: [], appointmentId: 'ap-1', practitionerRoleId: 'own', doctorName: 'Орлов А. Н.' } as unknown as HistoryItem;
const PATIENT = { id: 'p1', active: true, fullName: 'Лебедева Анна', lastName: 'Лебедева', firstName: 'Анна', birthDate: '1992-11-02', telecom: [] };

describe('DoctorVisitPrint', () => {
  const print = jest.fn();
  const onDone = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    useUiStore.setState({ locale: 'ru' });
    window.print = print;
  });

  afterEach(() => {
    document.body.classList.remove('printing-visit');
  });

  it('should not print and should report done when the patient card cannot be read', () => {
    jest.mocked(usePatient).mockReturnValue({ data: undefined, isError: true } as never);
    jest.mocked(useVisitPrescriptions).mockReturnValue({ data: { items: [], meta: META }, isError: false } as never);

    render(<DoctorVisitPrint item={ITEM} patientId="p1" onDone={onDone} />);

    expect(onDone).toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(screen.queryByTestId('visit-print-sheet')).not.toBeInTheDocument();
  });

  it('should not print and should report done when the prescriptions of the visit cannot be read', () => {
    jest.mocked(usePatient).mockReturnValue({ data: PATIENT, isError: false } as never);
    jest.mocked(useVisitPrescriptions).mockReturnValue({ data: undefined, isError: true } as never);

    render(<DoctorVisitPrint item={ITEM} patientId="p1" onDone={onDone} />);

    expect(onDone).toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
    expect(screen.queryByTestId('visit-print-sheet')).not.toBeInTheDocument();
  });

  it('should not print while the data is still loading', () => {
    jest.mocked(usePatient).mockReturnValue({ data: undefined, isError: false } as never);
    jest.mocked(useVisitPrescriptions).mockReturnValue({ data: undefined, isError: false } as never);

    render(<DoctorVisitPrint item={ITEM} patientId="p1" onDone={onDone} />);

    expect(onDone).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
  });
});
