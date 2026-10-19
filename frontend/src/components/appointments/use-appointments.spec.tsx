import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { newQueryClient, pageOf } from '@/components/patient/cabinet-test-utils';
import { appointmentFixture } from './appointment-fixtures';
import type { AppointmentListParams } from './appointment-api';
import { isListOfTab, useAppointments } from './use-appointments';

jest.mock('./appointment-api', () => ({ cancelAppointment: jest.fn(), fetchAppointments: jest.fn(), fetchAppointment: jest.fn() }));

import { fetchAppointments } from './appointment-api';

const listMock = fetchAppointments as jest.MockedFunction<typeof fetchAppointments>;

function renderList(initial: AppointmentListParams): { result: { current: ReturnType<typeof useAppointments> }; rerender: (params: AppointmentListParams) => void } {
  const client = newQueryClient();
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactNode => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook((params: AppointmentListParams) => useAppointments(params), { wrapper, initialProps: initial });
  return { result: view.result, rerender: view.rerender };
}

describe('isListOfTab', () => {
  it.each([
    ['a list of that tab', ['appointments', { tab: 'all', page: 1 }], true],
    ['a list of the other tab', ['appointments', { tab: 'upcoming', page: 1 }], false],
    ['a key without params', ['appointments'], false],
    ['an empty key', undefined, false],
    ['params that are not an object', ['appointments', 'all'], false],
  ])('should say %s is handled correctly for the all tab', (_name, key, expected) => {
    expect(isListOfTab(key, 'all')).toBe(expected);
  });
});

describe('useAppointments', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should not hand the answer of another tab over as a placeholder while the new tab is loading', async () => {
    listMock.mockResolvedValueOnce(pageOf([appointmentFixture({ id: '1' })]));
    const { result, rerender } = renderList({ tab: 'upcoming', page: 1, pageSize: 10 });
    await waitFor(() => expect(result.current.data).toBeDefined());
    listMock.mockReturnValue(new Promise(() => undefined));

    rerender({ tab: 'all', page: 1, pageSize: 10 });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('should hand the previous page of the same tab over as a placeholder while the next page is loading', async () => {
    listMock.mockResolvedValueOnce(pageOf([appointmentFixture({ id: '1' })], { totalItems: 25 }));
    const { result, rerender } = renderList({ tab: 'upcoming', page: 1, pageSize: 10 });
    await waitFor(() => expect(result.current.data).toBeDefined());
    listMock.mockReturnValue(new Promise(() => undefined));

    rerender({ tab: 'upcoming', page: 2, pageSize: 10 });

    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.items).toHaveLength(1);
  });
});
