import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api/api-fetch';
import { pageOf } from '../shared/test-utils';
import { labelOf, useSchedulePickers } from './use-schedule-pickers';

jest.mock('@/lib/api/api-fetch', () => {
  const actual = jest.requireActual('@/lib/api/api-fetch');
  return { ...actual, apiFetch: jest.fn() };
});

const apiFetchMock = apiFetch as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<unknown>>;

function doctorUser(id: string, name: string, role: string | null, isActive = true): Record<string, unknown> {
  return { id, name, email: `${id}@x.test`, firstName: name, lastName: name, roles: ['DOCTOR'], patientRef: null, practitionerRoleRef: role, isActive, role: 'DOCTOR' };
}

function wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSchedulePickers', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path) => {
      if (path.startsWith('/api/v1/admin/users')) {
        return Promise.resolve(pageOf([doctorUser('u1', 'Иванова Мария', 'PractitionerRole/role-1'), doctorUser('u2', 'Без роли', null), doctorUser('u3', 'Отключён', 'PractitionerRole/role-3', false)]));
      }
      if (path.startsWith('/api/v1/rooms')) return Promise.resolve(pageOf([{ id: 'room-1', identifier: '101', name: 'Кабинет 101', isActive: true }]));
      return Promise.resolve(pageOf([{ id: 'svc-1', name: 'Приём', typeSystem: 's', typeCode: 'c', defaultDurationMin: 25, isActive: true }]));
    });
  });

  it('should offer as doctors the active DOCTOR accounts when they are linked to a PractitionerRole, by the bare role id', async () => {
    const { result } = renderHook(() => useSchedulePickers(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.doctors).toEqual([{ value: 'role-1', label: 'Иванова Мария' }]);
  });

  it('should keep a disabled doctor in the labels with a mark when his account is off, so that his schedule is not named by a raw id', async () => {
    const { result } = renderHook(() => useSchedulePickers(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.allDoctors).toEqual([
      { value: 'role-1', label: 'Иванова Мария' },
      { value: 'role-3', label: 'Отключён (учётная запись отключена)' },
    ]);
    expect(labelOf(result.current.allDoctors, 'role-3')).toBe('Отключён (учётная запись отключена)');
  });

  it('should not flag the lists as truncated when every entry fits in the page', async () => {
    const { result } = renderHook(() => useSchedulePickers(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.isTruncated).toBe(false);
  });

  it('should flag the lists as truncated when the server has more rooms than the page holds', async () => {
    apiFetchMock.mockImplementation((path) => {
      if (path.startsWith('/api/v1/rooms')) {
        return Promise.resolve({ items: [{ id: 'room-1', identifier: '101', name: 'Кабинет 101', isActive: true }], meta: { page: 1, pageSize: 100, totalItems: 140, totalPages: 2 } });
      }
      return Promise.resolve(pageOf([]));
    });
    const { result } = renderHook(() => useSchedulePickers(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.isTruncated).toBe(true);
  });

  it('should read all the doctors, rooms and services at once with the largest page size when the pickers load', async () => {
    const { result } = renderHook(() => useSchedulePickers(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/admin/users?page=1&pageSize=100&role=DOCTOR');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/rooms?page=1&pageSize=100');
    expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/services?page=1&pageSize=100');
  });

  it('should label a room with its number and keep the default duration of a service when the lists arrive', async () => {
    const { result } = renderHook(() => useSchedulePickers(), { wrapper });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.rooms).toEqual([{ value: 'room-1', label: 'Кабинет 101 (101)' }]);
    expect(result.current.services).toEqual([{ value: 'svc-1', label: 'Приём', durationMin: 25 }]);
  });
});

describe('labelOf', () => {
  const options = [{ value: 'a', label: 'Альфа' }];

  it('should return the label when the id is known', () => {
    expect(labelOf(options, 'a')).toBe('Альфа');
  });

  it('should fall back to the raw id when the list does not know it', () => {
    expect(labelOf(options, '1811')).toBe('1811');
  });

  it('should return a dash when the id is missing', () => {
    expect(labelOf(options, undefined)).toBe('—');
    expect(labelOf(options, '')).toBe('—');
  });
});
