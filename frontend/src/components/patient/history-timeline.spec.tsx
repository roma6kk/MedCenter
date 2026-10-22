import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { historyFixture, LONG_UNBROKEN_TEXT, medicationFixture } from './cabinet-fixtures';
import { apiProblem, expectWraps, pageOf, renderWithClient, resetCabinetState } from './cabinet-test-utils';
import { HistoryTimeline } from './history-timeline';

jest.mock('./patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn(), fetchAccount: jest.fn(), fetchPatientProfile: jest.fn() }));

import { fetchMyHistory, fetchMyPrescriptions } from './patient-api';

const historyMock = fetchMyHistory as jest.MockedFunction<typeof fetchMyHistory>;
const prescriptionsMock = fetchMyPrescriptions as jest.MockedFunction<typeof fetchMyPrescriptions>;

async function openVisit(): Promise<HTMLElement> {
  const visit = await screen.findByRole('article');
  await userEvent.click(within(visit).getByRole('button', { expanded: false }));
  return visit;
}

describe('HistoryTimeline', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    prescriptionsMock.mockResolvedValue(pageOf([]));
  });

  it('should show a loading skeleton while the first page is being read', () => {
    historyMock.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<HistoryTimeline />);

    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('should show the visit with its Minsk time, diagnosis chip, summary and recommendations', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture()]));

    renderWithClient(<HistoryTimeline />);

    const visit = await openVisit();
    expect(within(visit).getByText(/09:00/)).toHaveAttribute('datetime', '2026-10-12T06:00:00.000Z');
    expect(within(visit).getByTestId('code-chip')).toHaveTextContent('J06.9');
    expect(within(visit).getByText('Острая инфекция верхних дыхательных путей неуточнённая')).toBeInTheDocument();
    expect(within(visit).getByText('(подтверждён)')).toBeInTheDocument();
    expect(within(visit).getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(within(visit).getByText('Жалобы на кашель и температуру 37,5.')).toBeInTheDocument();
    expect(within(visit).getByText('Обильное питьё, покой.')).toBeInTheDocument();
    expect(within(visit).getByText('Приём терапевта (первичный)')).toBeInTheDocument();
  });

  it('should link every visit to its appointment', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture()]));

    renderWithClient(<HistoryTimeline />);

    await openVisit();

    expect(screen.getByRole('link', { name: 'Запись на приём' })).toHaveAttribute('href', '/appointments/1552');
    expect(screen.getByRole('link', { name: 'Записаться повторно' })).toHaveAttribute('href', '/booking');
  });

  it('should show the primary code alone when an old record has no diagnosis list', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture({ diagnoses: [], diagnosis: 'I10' })]));

    renderWithClient(<HistoryTimeline />);

    const visit = await screen.findByRole('article');

    expect(within(visit).getByTestId('code-chip')).toHaveTextContent('I10');
  });

  it('should say no diagnosis was recorded when the visit has none', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture({ diagnoses: [], diagnosis: '', summary: undefined })]));

    renderWithClient(<HistoryTimeline />);

    expect(await screen.findByText('Диагноз не указан')).toBeInTheDocument();
    expect(within(screen.getByRole('article')).queryByTestId('code-chip')).not.toBeInTheDocument();
  });

  it('should show the empty state and no print button when there are no visits', async () => {
    historyMock.mockResolvedValue(pageOf([]));

    renderWithClient(<HistoryTimeline />);

    expect(await screen.findByText('История пуста')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выписка из медкарты' })).not.toBeInTheDocument();
  });

  it('should show a banner with the request id and retry when the service fails', async () => {
    historyMock.mockRejectedValueOnce(apiProblem(500, 'INTERNAL', { requestId: 'req-5' }));
    historyMock.mockResolvedValue(pageOf([historyFixture()]));
    renderWithClient(<HistoryTimeline />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-5');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it('should read the next server page when the pager is used', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture()], { totalItems: 25 }));
    renderWithClient(<HistoryTimeline />);
    await screen.findByRole('article');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(historyMock).toHaveBeenCalledWith({ page: 2, pageSize: 10 }));
  });

  it('should open the print dialog when the print button is pressed', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    historyMock.mockResolvedValue(pageOf([historyFixture()]));
    renderWithClient(<HistoryTimeline />);

    await userEvent.click(await screen.findByRole('button', { name: 'Выписка из медкарты' }));

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('should let the summary, the recommendations and the diagnosis name wrap when they have no spaces', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture({ summary: LONG_UNBROKEN_TEXT, recommendations: `${LONG_UNBROKEN_TEXT}R`, diagnoses: [{ code: 'J06.9', display: `${LONG_UNBROKEN_TEXT}D` }] })]));

    renderWithClient(<HistoryTimeline />);

    const visit = await openVisit();
    for (const text of [LONG_UNBROKEN_TEXT, `${LONG_UNBROKEN_TEXT}R`, `${LONG_UNBROKEN_TEXT}D`]) expectWraps(within(visit).getByText(text));
  });

  it('should group visits under a month heading in an ordered list', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture(), historyFixture({ id: 'enc-2', date: '2026-09-02T06:00:00.000Z', appointmentId: '9' })]));

    renderWithClient(<HistoryTimeline />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Октябрь 2026' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Сентябрь 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: /Октябрь 2026|Сентябрь 2026/ })).toHaveLength(2);
  });

  it('should show the summary tiles, the total from the response and mark page-only figures', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture()], { totalItems: 25 }));

    renderWithClient(<HistoryTimeline />);

    const tiles = within(await screen.findByRole('list', { name: 'Сводка' }));
    expect(tiles.getByText('25')).toBeInTheDocument();
    expect(tiles.getAllByText('на этой странице')).toHaveLength(2);
    expect(tiles.getByText('самый частый диагноз')).toBeInTheDocument();
  });

  it('should list the prescriptions of the visit, matched by encounter id, and no others', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture(), historyFixture({ id: 'enc-2', date: '2026-10-01T06:00:00.000Z' })]));
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture()]));
    renderWithClient(<HistoryTimeline />);
    const [first, second] = await screen.findAllByRole('article');

    await userEvent.click(within(first as HTMLElement).getByRole('button'));
    await userEvent.click(within(second as HTMLElement).getByRole('button'));

    await waitFor(() => expect(within(first as HTMLElement).getByText(/Азитромицин/)).toBeInTheDocument());
    expect(within(second as HTMLElement).queryByText(/Азитромицин/)).not.toBeInTheDocument();
  });

  it('should filter the loaded visits by diagnosis', async () => {
    historyMock.mockResolvedValue(pageOf([historyFixture(), historyFixture({ id: 'enc-2', diagnosis: 'I10', diagnoses: [{ code: 'I10', display: 'Гипертензия' }] })]));
    renderWithClient(<HistoryTimeline />);
    await screen.findAllByRole('article');

    await userEvent.click(within(screen.getByRole('group', { name: 'Диагноз' })).getByRole('button', { name: 'I10' }));

    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('should show one heading and a banner with a retry, not a second not-found screen, when the read answers 404', async () => {
    historyMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND', { requestId: 'req-21' }));

    renderWithClient(<HistoryTimeline />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-21');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText('История пуста')).not.toBeInTheDocument();
  });
});
