import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiProblem } from '@/components/patient/cabinet-test-utils';
import * as api from './consent-api';
import type { ConsentRecord, PatientConsent } from './consent-types';
import { useMyConsent, usePatientConsent, useRecordConsent, useRevokeMyConsent, useRevokePatientConsent } from './use-consent';

jest.mock('./consent-api');
const mocked = jest.mocked(api);

const RECORD: ConsentRecord = { id: 'c1', status: 'active', formNumber: 'Ф-1', signedAt: '2026-10-20', performer: { type: 'Patient', id: 'p1' }, period: { start: '2026-10-20' } };
const ACTIVE: PatientConsent = { active: RECORD, history: [RECORD] };

function setup(): { readonly client: QueryClient; readonly wrapper: (props: { readonly children: ReactNode }) => ReactNode } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}

const FILE = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
const ENTRY = { file: FILE, body: { formNumber: 'Ф-1', signedAt: '2026-10-20', consenterType: 'self' as const, signedByName: 'Петрова А. И.' } };

describe('consent queries', () => {
  beforeEach(() => jest.resetAllMocks());

  it('should read the own consent under the own key', async () => {
    mocked.fetchMyConsent.mockResolvedValue(ACTIVE);
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useMyConsent(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(ACTIVE));
    expect(client.getQueryData(['consent', 'me'])).toEqual(ACTIVE);
  });

  it('should read the consent of the patient the staff member opened under that patient key', async () => {
    mocked.fetchPatientConsent.mockResolvedValue({ active: null, history: [] });
    const { client, wrapper } = setup();

    const { result } = renderHook(() => usePatientConsent('p1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.fetchPatientConsent).toHaveBeenCalledWith('p1', expect.anything());
    expect(client.getQueryData(['consent', 'patient', 'p1'])).toBeDefined();
  });
});

describe('consent mutations', () => {
  beforeEach(() => jest.resetAllMocks());

  it('should refresh every consent view after the patient revokes their consent', async () => {
    mocked.postMyConsentRevoke.mockResolvedValue({ ...RECORD, status: 'inactive' });
    const { client, wrapper } = setup();
    client.setQueryData(['consent', 'me'], ACTIVE);
    client.setQueryData(['consent', 'patient', 'p1'], ACTIVE);

    const { result } = renderHook(() => useRevokeMyConsent(), { wrapper });
    await act(async () => { await result.current.mutateAsync(); });

    expect(client.getQueryState(['consent', 'me'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['consent', 'patient', 'p1'])?.isInvalidated).toBe(true);
  });

  it('should upload the scan first and record the consent with the id the upload returned', async () => {
    mocked.postConsentScan.mockResolvedValue({ scanId: 's1', contentType: 'application/pdf', size: 8, hash: 'h' });
    mocked.postPatientConsent.mockResolvedValue(RECORD);
    const { client, wrapper } = setup();
    client.setQueryData(['consent', 'patient', 'p1'], { active: null, history: [] });

    const { result } = renderHook(() => useRecordConsent('p1'), { wrapper });
    await act(async () => { await result.current.mutateAsync(ENTRY); });

    expect(mocked.postConsentScan).toHaveBeenCalledWith('p1', FILE);
    expect(mocked.postPatientConsent).toHaveBeenCalledWith('p1', { ...ENTRY.body, scanId: 's1' });
    expect(client.getQueryState(['consent', 'patient', 'p1'])?.isInvalidated).toBe(true);
  });

  it('should not upload the same file twice when the record is sent again after a 409', async () => {
    mocked.postConsentScan.mockResolvedValue({ scanId: 's1', contentType: 'application/pdf', size: 8, hash: 'h' });
    mocked.postPatientConsent.mockRejectedValueOnce(apiProblem(409, 'CONSENT_ALREADY_ACTIVE')).mockResolvedValueOnce(RECORD);
    const { wrapper } = setup();

    const { result } = renderHook(() => useRecordConsent('p1'), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync(ENTRY)).rejects.toMatchObject({ errorCode: 'CONSENT_ALREADY_ACTIVE' }); });
    await act(async () => { await result.current.mutateAsync(ENTRY); });

    expect(mocked.postConsentScan).toHaveBeenCalledTimes(1);
    expect(mocked.postPatientConsent).toHaveBeenCalledTimes(2);
  });

  it('should not record anything when the upload is refused', async () => {
    mocked.postConsentScan.mockRejectedValue(apiProblem(400, 'VALIDATION_ERROR'));
    const { wrapper } = setup();

    const { result } = renderHook(() => useRecordConsent('p1'), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync(ENTRY)).rejects.toBeDefined(); });

    expect(mocked.postPatientConsent).not.toHaveBeenCalled();
  });

  it('should send the application number of the written revocation and refresh the views', async () => {
    mocked.postPatientConsentRevoke.mockResolvedValue({ ...RECORD, status: 'inactive' });
    const { client, wrapper } = setup();
    client.setQueryData(['consent', 'patient', 'p1'], ACTIVE);

    const { result } = renderHook(() => useRevokePatientConsent('p1'), { wrapper });
    await act(async () => { await result.current.mutateAsync({ applicationNumber: 'З-7' }); });

    expect(mocked.postPatientConsentRevoke).toHaveBeenCalledWith('p1', { applicationNumber: 'З-7' });
    expect(client.getQueryState(['consent', 'patient', 'p1'])?.isInvalidated).toBe(true);
  });
});
