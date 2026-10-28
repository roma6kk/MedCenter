import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pageOf, renderWithClient, resetCabinetState } from './cabinet-test-utils';
import { historyFixture, medicationFixture } from './cabinet-fixtures';
import { parseMedcardTab } from './medcard-tab';
import { MedicalRecord } from './medical-record';

jest.mock('./patient-api', () => ({ fetchMyHistory: jest.fn(), fetchMyPrescriptions: jest.fn() }));

import { fetchMyHistory, fetchMyPrescriptions } from './patient-api';

const historyMock = fetchMyHistory as jest.MockedFunction<typeof fetchMyHistory>;
const prescriptionsMock = fetchMyPrescriptions as jest.MockedFunction<typeof fetchMyPrescriptions>;

describe('MedicalRecord', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    window.history.replaceState(null, '', '/medcard');
    historyMock.mockResolvedValue(pageOf([historyFixture()]));
    prescriptionsMock.mockResolvedValue(pageOf([medicationFixture()]));
  });

  it('should open on the visit history with one heading for the page and the history tab selected', async () => {
    renderWithClient(<MedicalRecord />);

    expect(screen.getByRole('heading', { level: 1, name: 'Медкарта' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'История приёмов' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Приём терапевта (первичный)')).toBeInTheDocument();
    expect(document.title).toBe('Медкарта — Лайфлайн');
  });

  it('should open on the prescriptions when asked to', async () => {
    renderWithClient(<MedicalRecord initialTab="prescriptions" />);

    expect(screen.getByRole('tab', { name: 'Назначения' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Азитромицин')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('should switch the section and keep the choice in the address without adding a history entry', async () => {
    renderWithClient(<MedicalRecord />);
    const entries: number = window.history.length;

    await userEvent.click(screen.getByRole('tab', { name: 'Назначения' }));

    expect(await screen.findByText('Азитромицин')).toBeInTheDocument();
    expect(within(document.getElementById('medcard-panel') as HTMLElement).queryByText('Приём терапевта (первичный)')).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/medcard?tab=prescriptions');
    expect(window.history.length).toBe(entries);

    await userEvent.click(screen.getByRole('tab', { name: 'История приёмов' }));
    expect(window.location.pathname + window.location.search).toBe('/medcard');
  });
});

describe('parseMedcardTab', () => {
  it.each([
    ['prescriptions', 'prescriptions'],
    ['history', 'history'],
    [undefined, 'history'],
    ['nonsense', 'history'],
  ] as const)('should read %p as %s', (value, expected) => {
    expect(parseMedcardTab(value)).toBe(expected);
  });
});
