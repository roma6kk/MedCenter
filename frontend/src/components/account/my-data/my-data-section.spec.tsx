import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appointmentFixture } from '@/components/appointments/appointment-fixtures';
import { WITH_ACTIVE } from '@/components/consent/consent-fixtures';
import { accountFixture, historyFixture, medicationFixture, patientProfileFixture } from '@/components/patient/cabinet-fixtures';
import { pageOf, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useUiStore } from '@/store/use-ui-store';
import { MyDataSection } from './my-data-section';

jest.mock('@/components/patient/patient-api');
jest.mock('@/components/appointments/appointment-api');
jest.mock('@/components/consent/consent-api');

import { fetchAppointments } from '@/components/appointments/appointment-api';
import { fetchMyConsent } from '@/components/consent/consent-api';
import { fetchAccount, fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile } from '@/components/patient/patient-api';

const mocked = {
  account: jest.mocked(fetchAccount),
  patient: jest.mocked(fetchPatientProfile),
  consent: jest.mocked(fetchMyConsent),
  appointments: jest.mocked(fetchAppointments),
  history: jest.mocked(fetchMyHistory),
  prescriptions: jest.mocked(fetchMyPrescriptions),
};

let blobs: Blob[];
let click: jest.SpyInstance;
let downloadName: string | undefined;

function readBlob(blob: Blob | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob as Blob);
  });
}

function loadAll(): void {
  mocked.account.mockResolvedValue(accountFixture({ accountConsent: { at: '2026-10-01T08:00:00.000Z', version: '2026-10' } }));
  mocked.patient.mockResolvedValue(patientProfileFixture());
  mocked.consent.mockResolvedValue(WITH_ACTIVE);
  mocked.appointments.mockResolvedValue(pageOf([appointmentFixture()]));
  mocked.history.mockResolvedValue(pageOf([historyFixture()]));
  mocked.prescriptions.mockResolvedValue(pageOf([medicationFixture()]));
}

describe('MyDataSection', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    blobs = [];
    downloadName = undefined;
    Object.assign(URL, {
      createObjectURL: jest.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:my-data';
      }),
      revokeObjectURL: jest.fn(),
    });
    click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadName = this.download;
    });
  });

  afterEach(() => click.mockRestore());

  it('should offer the download and fetch nothing until it is pressed', () => {
    renderWithClient(<MyDataSection />);

    expect(screen.getByRole('heading', { name: 'Мои данные' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скачать мои данные' })).toBeInTheDocument();
    expect(mocked.account).not.toHaveBeenCalled();
  });

  it('should save a dated JSON file with the data and the information block when the button is pressed', async () => {
    loadAll();
    renderWithClient(<MyDataSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Скачать мои данные' }));

    expect(await screen.findByText('Файл сохранён в папку загрузок.')).toBeInTheDocument();
    expect(downloadName).toMatch(/^medcenter-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(blobs[0]?.type).toBe('application/json;charset=utf-8');
    const text: string = await readBlob(blobs[0]);
    const file = JSON.parse(text) as { information: { consent: { accountConsentTextVersion: string } }; appointments: unknown[]; encounters: unknown[]; prescriptions: unknown[]; consent: { active: { id: string } } };
    expect(file.information.consent.accountConsentTextVersion).toBe('2026-10');
    expect(file.appointments).toHaveLength(1);
    expect(file.encounters).toHaveLength(1);
    expect(file.prescriptions).toHaveLength(1);
    expect(file.consent.active.id).toBe('c-active');
  });

  it('should read every page of a long list', async () => {
    loadAll();
    mocked.history.mockResolvedValueOnce(pageOf([historyFixture({ id: 'h1' })], { totalItems: 2, pageSize: 1, page: 1 }));
    mocked.history.mockResolvedValueOnce(pageOf([historyFixture({ id: 'h2' })], { totalItems: 2, pageSize: 1, page: 2 }));
    renderWithClient(<MyDataSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Скачать мои данные' }));

    await waitFor(() => expect(blobs).toHaveLength(1));
    const file = JSON.parse(await readBlob(blobs[0])) as { encounters: { id: string }[] };
    expect(file.encounters.map((entry) => entry.id)).toEqual(['h1', 'h2']);
  });

  it('should write the information in English when the interface is English', async () => {
    useUiStore.setState({ locale: 'en' });
    loadAll();
    renderWithClient(<MyDataSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Download my data' }));

    await waitFor(() => expect(blobs).toHaveLength(1));
    const file = JSON.parse(await readBlob(blobs[0])) as { information: { fullInformation: string } };
    expect(file.information.fullInformation).toMatch(/5 working days/);
  });

  it('should say so and save nothing when a read fails', async () => {
    loadAll();
    mocked.prescriptions.mockRejectedValue(new Error('down'));
    renderWithClient(<MyDataSection />);

    await userEvent.click(screen.getByRole('button', { name: 'Скачать мои данные' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подготовить файл');
    expect(blobs).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Скачать мои данные' })).toBeInTheDocument();
  });
});
