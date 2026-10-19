import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LONG_UNBROKEN_TEXT, medicationFixture, serviceFixture } from './cabinet-fixtures';
import { apiProblem, expectWraps, pageOf, renderWithClient, resetCabinetState } from './cabinet-test-utils';
import { PrescriptionList } from './prescription-list';
import { useUiStore } from '@/store/use-ui-store';

jest.mock('./patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn(), fetchAccount: jest.fn(), fetchPatientProfile: jest.fn() }));

import { fetchMyPrescriptions } from './patient-api';

const prescriptionsMock = fetchMyPrescriptions as jest.MockedFunction<typeof fetchMyPrescriptions>;

describe('PrescriptionList', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
  });

  it('should show the ATC code, the drug name and the dosage when the item is a medication', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture()]));

    renderWithClient(<PrescriptionList />);

    const card = await screen.findByRole('article');
    expect(within(card).getByTestId('code-chip')).toHaveTextContent('J01FA10');
    expect(within(card).getByTestId('code-chip')).toHaveAttribute('title', 'http://www.whocc.no/atc');
    expect(within(card).getByText('Азитромицин')).toBeInTheDocument();
    expect(within(card).getByText(/1 таб 3 раза в день после еды/)).toBeInTheDocument();
    expect(within(card).getByText('Лекарство')).toBeInTheDocument();
    expect(within(card).getByText(/Курс 5 дней/)).toBeInTheDocument();
  });

  it('should show the catalogue code and name but no ATC chip and no dosage when the item is a service', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([serviceFixture()]));

    renderWithClient(<PrescriptionList />);

    const card = await screen.findByRole('article');
    expect(card).toHaveAttribute('data-kind', 'service');
    expect(within(card).getByTestId('code-chip')).toHaveTextContent('LAB-101');
    expect(within(card).getByTestId('code-chip')).not.toHaveAttribute('title', 'http://www.whocc.no/atc');
    expect(within(card).getByText('Общий анализ крови')).toBeInTheDocument();
    expect(within(card).getByText('Исследование или услуга')).toBeInTheDocument();
    expect(within(card).queryByText(/Дозировка/)).not.toBeInTheDocument();
  });

  it('should show only the code chip when a service has no display name', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([serviceFixture({ display: undefined })]));

    renderWithClient(<PrescriptionList />);

    expect(await screen.findAllByTestId('code-chip')).toHaveLength(1);
  });

  it('should list a mixed page with one card per item and the right kind', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture(), serviceFixture()]));

    renderWithClient(<PrescriptionList />);

    const list = await screen.findByRole('list', { name: 'Назначения врача' });
    const kinds = within(list).getAllByRole('article').map((card) => card.getAttribute('data-kind'));
    expect(kinds).toEqual(['medication', 'service']);
  });

  it.each([
    ['active', 'Действует', 'stamp-active'],
    ['completed', 'Выполнено', 'stamp-completed'],
    ['on-hold', 'Приостановлено', 'stamp-pending'],
    ['revoked', 'Отозвано', 'stamp-cancelled'],
  ])('should show the %s status as "%s" in the matching stamp', async (status, label, testId) => {
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture({ status })]));

    renderWithClient(<PrescriptionList />);

    expect(await screen.findByTestId(testId)).toHaveTextContent(label);
  });

  it('should show a neutral label when the status is one the catalogue does not know', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture({ status: 'something-new' })]));

    renderWithClient(<PrescriptionList />);

    expect(await screen.findByTestId('stamp-pending')).toHaveTextContent('Статус не указан');
  });

  it('should show the prescription date in clinic time', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture({ authoredOn: '2026-10-12T22:30:00.000Z' })]));

    renderWithClient(<PrescriptionList />);

    expect(await screen.findByText(/Назначено: 13 окт\. 2026/)).toBeInTheDocument();
  });

  it('should show the empty state when nothing was prescribed', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([]));

    renderWithClient(<PrescriptionList />);

    expect(await screen.findByText('Назначений нет')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Печать' })).not.toBeInTheDocument();
  });

  it('should show a loading skeleton while the list is being read', () => {
    prescriptionsMock.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<PrescriptionList />);

    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument();
  });

  it('should show a banner with the request id and retry when the service fails', async () => {
    prescriptionsMock.mockRejectedValueOnce(apiProblem(500, 'INTERNAL', { requestId: 'req-8' }));
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture()]));
    renderWithClient(<PrescriptionList />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-8');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByRole('article')).toBeInTheDocument();
  });

  it('should read the next server page when the pager is used', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture()], { totalItems: 25 }));
    renderWithClient(<PrescriptionList />);
    await screen.findByRole('article');

    await userEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    await waitFor(() => expect(prescriptionsMock).toHaveBeenCalledWith({ page: 2, pageSize: 10 }));
  });

  it('should open the print dialog when the print button is pressed', async () => {
    const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture()]));
    renderWithClient(<PrescriptionList />);

    await userEvent.click(await screen.findByRole('button', { name: 'Печать' }));

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('should label the status in English when the locale is en', async () => {
    useUiStore.setState({ locale: 'en' });
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture({ status: 'active' })]));

    renderWithClient(<PrescriptionList />);

    expect(await screen.findByTestId('stamp-active')).toHaveTextContent('Active');
    expect(screen.getByText('Medication')).toBeInTheDocument();
  });

  it('should let the drug name, the dosage and the note wrap when they have no spaces', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture({ atcDisplay: `${LONG_UNBROKEN_TEXT}A`, dosageText: `${LONG_UNBROKEN_TEXT}B`, note: `${LONG_UNBROKEN_TEXT}C` })]));

    renderWithClient(<PrescriptionList />);

    await screen.findByRole('article');
    expectWraps(screen.getByText(`${LONG_UNBROKEN_TEXT}A`));
    expectWraps(screen.getByText(`${LONG_UNBROKEN_TEXT}B`, { exact: false }));
    expectWraps(screen.getByText(`${LONG_UNBROKEN_TEXT}C`, { exact: false }));
  });

  it('should let the name of a service wrap when it has no spaces', async () => {
    prescriptionsMock.mockResolvedValue(pageOf([serviceFixture({ display: LONG_UNBROKEN_TEXT })]));

    renderWithClient(<PrescriptionList />);

    expectWraps(await screen.findByText(LONG_UNBROKEN_TEXT));
  });

  it('should show one heading and a banner with a retry, not a second not-found screen, when the read answers 404', async () => {
    prescriptionsMock.mockRejectedValue(apiProblem(404, 'NOT_FOUND', { requestId: 'req-22' }));

    renderWithClient(<PrescriptionList />);

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-22');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText('Назначений нет')).not.toBeInTheDocument();
  });
});
