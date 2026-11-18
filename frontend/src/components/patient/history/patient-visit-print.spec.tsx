import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { historyFixture, medicationFixture, patientProfileFixture, serviceFixture } from '../cabinet-fixtures';
import { pageOf, renderWithClient, resetCabinetState } from '../cabinet-test-utils';
import { HistoryTimeline } from '../history-timeline';

jest.mock('../patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn(), fetchAccount: jest.fn(), fetchPatientProfile: jest.fn() }));

import { fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile } from '../patient-api';

const FOOTER = 'Внесено: Иванов Иван Иванович, 12 окт. 2026 г., 09:30. Документ сформирован информационной системой и не является медицинским документом; юридическую силу имеет запись в медицинской карте на бумаге.';

let sheetAtPrint: HTMLElement | null = null;
let bodyClassAtPrint = false;

function printedSheet(): HTMLElement {
  return sheetAtPrint as HTMLElement;
}

async function pressPrint(): Promise<void> {
  const visit = await screen.findByRole('article');
  await userEvent.click(within(visit).getByRole('button', { expanded: false }));
  await userEvent.click(within(visit).getByRole('button', { name: /^Печать приёма от/ }));
}

describe('printing one visit from the patient history', () => {
  const print = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    sheetAtPrint = null;
    bodyClassAtPrint = false;
    print.mockImplementation(() => {
      const sheet = screen.queryByTestId('visit-print-sheet');
      sheetAtPrint = sheet === null ? null : (sheet.cloneNode(true) as HTMLElement);
      bodyClassAtPrint = document.body.classList.contains('printing-visit');
    });
    resetCabinetState();
    window.print = print;
    jest.mocked(fetchMyHistory).mockResolvedValue(pageOf([historyFixture({ doctorName: 'Иванов Иван Иванович' })]));
    jest.mocked(fetchMyPrescriptions).mockResolvedValue(pageOf([medicationFixture({ encounterId: 'enc-1' }), serviceFixture({ encounterId: 'enc-1' })]));
    jest.mocked(fetchPatientProfile).mockResolvedValue(patientProfileFixture());
  });

  afterEach(() => {
    document.body.classList.remove('printing-visit');
  });

  it('should print a sheet with the clinic, the patient, the visit, the diagnoses, the orders and the footer without any claim of a signature', async () => {
    renderWithClient(<HistoryTimeline />);

    await pressPrint();

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const sheet = printedSheet();
    expect(within(sheet).getByText('Лайфлайн (учебный проект)')).toBeTruthy();
    expect(within(sheet).getByText('Лебедева Анна')).toBeTruthy();
    expect(within(sheet).getByText('2 ноября 1992 г.')).toBeTruthy();
    expect(within(sheet).getByText('12 окт. 2026 г., 09:00')).toBeTruthy();
    expect(within(sheet).getAllByText('Иванов Иван Иванович').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Приём терапевта (первичный)')).toBeTruthy();
    expect(within(sheet).getByText('J06.9')).toBeTruthy();
    expect(within(sheet).getByText('Жалобы на кашель и температуру 37,5.')).toBeTruthy();
    expect(within(sheet).getByText('Обильное питьё, покой.')).toBeTruthy();
    expect(within(sheet).getByText(/J01FA10/)).toBeTruthy();
    expect(sheet).toHaveTextContent(FOOTER);
    expect(sheet.textContent).not.toMatch(/подписан|ЭМК/i);
    expect(bodyClassAtPrint).toBe(true);
  });

  it('should remove the sheet and the print mode right after print returns, and stay harmless when afterprint fires later', async () => {
    renderWithClient(<HistoryTimeline />);
    await pressPrint();

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('visit-print-sheet')).not.toBeInTheDocument());
    expect(document.body).not.toHaveClass('printing-visit');

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(screen.queryByTestId('visit-print-sheet')).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('printing-visit');
  });

  it('should print again on a second click although afterprint never fires', async () => {
    renderWithClient(<HistoryTimeline />);
    await pressPrint();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const visit = screen.getByRole('article');

    await userEvent.click(within(visit).getByRole('button', { name: /^Печать приёма от/ }));

    await waitFor(() => expect(print).toHaveBeenCalledTimes(2));
    expect(within(printedSheet()).getByText('Лебедева Анна')).toBeTruthy();
  });

  it('should wait for the prescriptions to load before printing, then print them', async () => {
    let resolve: (value: ReturnType<typeof pageOf<ReturnType<typeof medicationFixture>>>) => void = () => undefined;
    jest.mocked(fetchMyPrescriptions).mockReturnValue(new Promise((done) => { resolve = done as typeof resolve; }));
    renderWithClient(<HistoryTimeline />);

    await pressPrint();

    await waitFor(() => expect(fetchPatientProfile).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(print).not.toHaveBeenCalled();
    expect(screen.queryByTestId('visit-print-sheet')).not.toBeInTheDocument();

    await act(async () => {
      resolve(pageOf([medicationFixture({ encounterId: 'enc-1' })]));
    });

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(within(printedSheet()).getByText(/J01FA10/)).toBeTruthy();
    expect(screen.queryByTestId('visit-print-orders-unavailable')).not.toBeInTheDocument();
  });

  it('should say the prescriptions are not loaded instead of "not specified" when their request failed', async () => {
    jest.mocked(fetchMyPrescriptions).mockRejectedValue(new Error('down'));
    renderWithClient(<HistoryTimeline />);

    await pressPrint();

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const row = within(printedSheet()).getByText('Назначения').closest('.visit-print-row') as HTMLElement;
    expect(row).toHaveTextContent('Назначения не загружены');
    expect(row).not.toHaveTextContent('Не указано');
  });

  it('should say the prescriptions are not loaded when the lookup covers only part of them, keeping the ones found', async () => {
    jest.mocked(fetchMyPrescriptions).mockResolvedValue(pageOf([medicationFixture({ encounterId: 'enc-1' })], { totalItems: 500, pageSize: 100 }));
    renderWithClient(<HistoryTimeline />);

    await pressPrint();

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const row = within(printedSheet()).getByText('Назначения').closest('.visit-print-row') as HTMLElement;
    expect(row).toHaveTextContent('J01FA10');
    expect(row).toHaveTextContent('Назначения не загружены');
  });

  it('should say the prescriptions are not loaded when a partial lookup finds none for this visit', async () => {
    jest.mocked(fetchMyPrescriptions).mockResolvedValue(pageOf([], { totalItems: 500, pageSize: 100 }));
    renderWithClient(<HistoryTimeline />);

    await pressPrint();

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const row = within(printedSheet()).getByText('Назначения').closest('.visit-print-row') as HTMLElement;
    expect(row).toHaveTextContent('Назначения не загружены');
    expect(row).not.toHaveTextContent('Не указано');
  });

  it('should not print when the patient card cannot be read', async () => {
    jest.mocked(fetchPatientProfile).mockRejectedValue(new Error('down'));
    renderWithClient(<HistoryTimeline />);

    await pressPrint();

    await waitFor(() => expect(fetchPatientProfile).toHaveBeenCalled());
    expect(screen.queryByTestId('visit-print-sheet')).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });
});
