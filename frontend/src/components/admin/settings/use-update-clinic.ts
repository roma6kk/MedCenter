'use client';

import type { UseMutationResult } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/api-fetch';
import type { ClinicDetails } from '@/components/catalog/use-clinic';
import { useAdminMutation } from '../shared/use-admin-mutation';

export function useUpdateClinic(): UseMutationResult<ClinicDetails, Error, ClinicDetails> {
  return useAdminMutation<ClinicDetails, ClinicDetails>({
    mutationFn: (details) => apiFetch<ClinicDetails>('/api/v1/admin/clinic', { method: 'PATCH', body: JSON.stringify(details) }),
    invalidates: 'admin-clinic',
    successMessageKey: 'admin.settings.toast.saved',
  });
}
