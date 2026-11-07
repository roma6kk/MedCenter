'use client';

import type { ReactNode } from 'react';
import { StampBadge, type AppointmentStatus } from '@/components/feedback/stamp-badge';

export function StatusBadge({ status }: { readonly status: AppointmentStatus }): ReactNode {
  return <StampBadge status={status} />;
}
