'use client';

import type { ReactNode } from 'react';
import { StampBadge, type AppointmentStatus } from '@/components/feedback/stamp-badge';

/** Soft badge of an appointment status: the shared `StampBadge` (tone and icon per status, localized word, `stamp-<status>` test id). */
export function StatusBadge({ status }: { readonly status: AppointmentStatus }): ReactNode {
  return <StampBadge status={status} />;
}
