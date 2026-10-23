import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiProblem, newQueryClient, pageOf, renderWithClient, resetCabinetState } from '@/components/patient/cabinet-test-utils';
import { useToastStore } from '@/store/use-toast-store';
import * as doctorApi from '@/components/doctor/doctor-api';
import * as api from './consent-api';
import { ACTIVE_RECORD } from './consent-fixtures';
import { ConsentRecordForm } from './consent-record-form';

jest.mock('./consent-api');
jest.mock('@/components/doctor/doctor-api');
const mocked = jest.mocked(api);
const doctorMocked = jest.mocked(doctorApi);

const RELATED = { id: 'rp1', patientId: 'p1', active: true, fullName: 'Иванова Мария', relationship: [{ code: 'MTH', display: 'Мать' }], telecom: [] };
const PDF = new File(['%PDF-1.4'], 'form.pdf', { type: 'application/pdf' });

function setFileSize(file: File, size: number): File {
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function renderForm(role: 'ADMIN' | 'DOCTOR' = 'DOCTOR'): void {
  renderWithClient(<ConsentRecordForm patientId="p1" role={role} />, newQueryClient());
}

async function fillSelf(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Номер формы'), 'Ф-12');
  await userEvent.type(screen.getByLabelText('Дата подписания'), '2020-01-15');
  await userEvent.upload(screen.getByLabelText('Скан подписанной формы'), PDF);
}

const submit = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Внести в карту' }));

describe('ConsentRecordForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    resetCabinetState();
    doctorMocked.fetchRelatedPersons.mockResolvedValue(pageOf([RELATED]));
    mocked.postConsentScan.mockResolvedValue({ scanId: 's1', contentType: 'application/pdf', size: 8, hash: 'h' });
    mocked.postPatientConsent.mockResolvedValue(ACTIVE_RECORD);
  });

  it('should leave the signing clerk to the server for a doctor and ask for the name from an administrator', () => {
    renderForm('DOCTOR');
    expect(screen.queryByLabelText(/ФИО медработника/)).not.toBeInTheDocument();
    expect(screen.getByText('Заполняется автоматически по вашей учётной записи.')).toBeInTheDocument();
  });

  it('should ask an administrator for the clerk name and send it', async () => {
    renderForm('ADMIN');

    await fillSelf();
    await submit();
    expect(await screen.findByText('Поле обязательно для заполнения')).toBeInTheDocument();
    expect(mocked.postConsentScan).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/ФИО медработника/), ' Петрова А. И. ');
    await submit();
    await waitFor(() => expect(mocked.postPatientConsent).toHaveBeenCalled());
    expect(mocked.postPatientConsent).toHaveBeenCalledWith('p1', expect.objectContaining({ signedByName: 'Петрова А. И.' }));
  });

  it('should show what is missing and send nothing when the form is empty', async () => {
    renderForm();

    await submit();

    expect(await screen.findAllByText('Поле обязательно для заполнения')).toHaveLength(2);
    expect(screen.getByText('Приложите скан подписанной формы')).toBeInTheDocument();
    expect(mocked.postConsentScan).not.toHaveBeenCalled();
  });

  it('should upload the scan, record the consent signed by the patient and clear the form', async () => {
    renderForm();

    await fillSelf();
    await submit();

    await waitFor(() => expect(mocked.postPatientConsent).toHaveBeenCalledTimes(1));
    expect(mocked.postConsentScan).toHaveBeenCalledWith('p1', PDF);
    expect(mocked.postPatientConsent).toHaveBeenCalledWith('p1', { status: 'active', formNumber: 'Ф-12', signedAt: '2020-01-15', consenterType: 'self', scanId: 's1' });
    await waitFor(() => expect(screen.getByLabelText('Номер формы')).toHaveValue(''));
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Запись о согласии внесена.');
  });

  it('should record a written refusal when that is what the patient signed', async () => {
    renderForm();

    await fillSelf();
    await userEvent.selectOptions(screen.getByLabelText('Что подписал пациент'), 'Письменный отказ');
    await submit();

    await waitFor(() => expect(mocked.postPatientConsent).toHaveBeenCalled());
    expect(mocked.postPatientConsent).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'rejected' }));
  });

  it.each([
    ['a file that is not PDF, JPEG or PNG', new File(['x'], 'a.gif', { type: 'image/gif' }), 'Скан должен быть в формате PDF, JPEG или PNG'],
    ['a file larger than 10 MB', setFileSize(new File(['x'], 'big.pdf', { type: 'application/pdf' }), 10 * 1024 * 1024 + 1), 'Файл больше 10 МБ'],
  ])('should refuse %s before anything is uploaded', async (_name, file, message) => {
    const user = userEvent.setup({ applyAccept: false });
    renderForm();

    await user.type(screen.getByLabelText('Номер формы'), 'Ф-12');
    await user.type(screen.getByLabelText('Дата подписания'), '2020-01-15');
    await user.upload(screen.getByLabelText('Скан подписанной формы'), file);
    await user.click(screen.getByRole('button', { name: 'Внести в карту' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Скан подписанной формы')).toHaveAttribute('aria-invalid', 'true');
    expect(mocked.postConsentScan).not.toHaveBeenCalled();
  });

  it('should refuse a signing date in the future', async () => {
    renderForm();

    await fillSelf();
    await userEvent.clear(screen.getByLabelText('Дата подписания'));
    await userEvent.type(screen.getByLabelText('Дата подписания'), '2999-01-01');
    await submit();

    expect(await screen.findByText('Дата подписания не может быть в будущем')).toBeInTheDocument();
    expect(mocked.postConsentScan).not.toHaveBeenCalled();
  });

  it('should ask for a trusted person and the authority document when someone other than the patient signed', async () => {
    renderForm();

    expect(screen.queryByLabelText('Доверенное лицо пациента')).not.toBeInTheDocument();
    await fillSelf();
    await userEvent.selectOptions(screen.getByLabelText('Кто подписал'), 'опекун');
    await submit();

    expect(await screen.findByText('Выберите доверенное лицо пациента')).toBeInTheDocument();
    expect(mocked.postConsentScan).not.toHaveBeenCalled();

    await userEvent.selectOptions(await screen.findByLabelText('Доверенное лицо пациента'), 'Иванова Мария (Мать)');
    await userEvent.type(screen.getByLabelText('Документ, подтверждающий полномочия'), 'Решение об опеке № 5');
    await submit();

    await waitFor(() => expect(mocked.postPatientConsent).toHaveBeenCalled());
    expect(mocked.postPatientConsent).toHaveBeenCalledWith('p1', expect.objectContaining({ consenterType: 'guardian', relatedPersonId: 'rp1', representativeDocument: 'Решение об опеке № 5' }));
  });

  it('should say there is nobody to choose when the patient has no trusted persons', async () => {
    doctorMocked.fetchRelatedPersons.mockResolvedValue(pageOf([]));
    renderForm();

    await userEvent.selectOptions(screen.getByLabelText('Кто подписал'), 'родственник');

    expect(await screen.findByText(/нет доверенных лиц в карте/)).toBeInTheDocument();
  });

  it('should say to revoke first when the patient already has an active consent (409 CONSENT_ALREADY_ACTIVE)', async () => {
    mocked.postPatientConsent.mockRejectedValue(apiProblem(409, 'CONSENT_ALREADY_ACTIVE'));
    renderForm();

    await fillSelf();
    await submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('У пациента уже есть действующее согласие. Сначала запишите его отзыв');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Номер формы')).toHaveValue('Ф-12');
  });

  it('should put a server field error next to its field', async () => {
    mocked.postPatientConsent.mockRejectedValue(apiProblem(400, 'VALIDATION_ERROR', { details: [{ field: 'formNumber', message: 'formNumber must not be blank' }] }));
    renderForm();

    await fillSelf();
    await submit();

    expect(await screen.findByLabelText('Номер формы')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByTestId('problem-banner')).not.toBeInTheDocument();
  });

  it('should show the scan refusal of the server on the file field', async () => {
    mocked.postConsentScan.mockRejectedValue(apiProblem(400, 'VALIDATION_ERROR', { details: [{ field: 'file', message: 'File content does not match PDF, JPEG or PNG' }] }));
    renderForm();

    await fillSelf();
    await submit();

    await waitFor(() => expect(screen.getByLabelText('Скан подписанной формы')).toHaveAttribute('aria-invalid', 'true'));
    expect(mocked.postPatientConsent).not.toHaveBeenCalled();
  });

  it('should show the problem banner for a failure no field explains', async () => {
    mocked.postPatientConsent.mockRejectedValue(apiProblem(403, 'COMPARTMENT_VIOLATION', { requestId: 'req-3' }));
    renderForm();

    await fillSelf();
    await submit();

    expect(await screen.findByTestId('problem-banner')).toHaveTextContent('req-3');
  });

  it('should keep the button focusable and send once while the request runs', async () => {
    let finish: (value: typeof ACTIVE_RECORD) => void = () => undefined;
    mocked.postPatientConsent.mockReturnValue(new Promise((done) => { finish = done; }));
    renderForm();

    await fillSelf();
    await submit();
    const busy = await screen.findByRole('button', { name: 'Вносим…' });
    await userEvent.click(busy);

    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(mocked.postPatientConsent).toHaveBeenCalledTimes(1);
    finish(ACTIVE_RECORD);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Внести в карту' })).toBeInTheDocument());
  });
});
