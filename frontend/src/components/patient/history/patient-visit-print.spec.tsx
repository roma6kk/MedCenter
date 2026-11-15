import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { historyFixture, medicationFixture, patientProfileFixture, serviceFixture } from '../cabinet-fixtures';
import { pageOf, renderWithClient, resetCabinetState } from '../cabinet-test-utils';
import { HistoryTimeline } from '../history-timeline';

jest.mock('../patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn(), fetchAccount: jest.fn(), fetchPatientProfile: jest.fn() }));

import { fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile } from '../patient-api';

const FOOTER = 'Внесено: Иванов Иван Иванович, 12 окт. 2026 г., 09:30. Документ сформирован информационной системой и не является медицинским документом; юридическую силу имеет запись в медицинской карте на бумаге.';

async function pressPrint(): Promise<void> {
  const visit = await screen.findByRole('article');
  await userEvent.click(within(visit).getByRole('button', { expanded: false }));
  await userEvent.click(within(visit).getByRole('button', { name: /^Печать приёма от/ }));
}

describe('printing one visit from the patient history', () => {
  const print = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
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

    const sheet = await screen.findByTestId('visit-print-sheet');
    expect(sheet.parentElement).toBe(document.body);
    expect(within(sheet).getByText('Лайфлайн (учебный проект)')).toBeInTheDocument();
    expect(within(sheet).getByText('Лебедева Анна')).toBeInTheDocument();
    expect(within(sheet).getByText('2 ноября 1992 г.')).toBeInTheDocument();
    expect(within(sheet).getByText('12 окт. 2026 г., 09:00')).toBeInTheDocument();
    expect(within(sheet).getAllByText('Иванов Иван Иванович').length).toBeGreaterThan(0);
    expect(within(sheet).getByText('Приём терапевта (первичный)')).toBeInTheDocument();
    expect(within(sheet).getByText('J06.9')).toBeInTheDocument();
    expect(within(sheet).getByText('Жалобы на кашель и температуру 37,5.')).toBeInTheDocument();
    expect(within(sheet).getByText('Обильное питьё, покой.')).toBeInTheDocument();
    expect(within(sheet).getByText(/J01FA10/)).toBeInTheDocument();
    expect(sheet).toHaveTextContent(FOOTER);
    expect(sheet.textContent).not.toMatch(/подписан|ЭМК/i);
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.body).toHaveClass('printing-visit');
  });

  it('should remove the sheet and the print mode once the print dialog is closed', async () => {
    renderWithClient(<HistoryTimeline />);
    await pressPrint();
    await screen.findByTestId('visit-print-sheet');

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    await waitFor(() => expect(screen.queryByTestId('visit-print-sheet')).not.toBeInTheDocument());
    expect(document.body).not.toHaveClass('printing-visit');
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
