import { Ban } from 'lucide-react';
import type { ReactNode } from 'react';
import { StampBadge } from '@/components/feedback/stamp-badge';

interface ActiveStatusBadgeProps {
  readonly isActive: boolean;
  readonly activeLabel: string;
  readonly inactiveLabel: string;
}

export function ActiveStatusBadge({ isActive, activeLabel, inactiveLabel }: ActiveStatusBadgeProps): ReactNode {
  return isActive ? <StampBadge status="active">{activeLabel}</StampBadge> : <StampBadge status="cancelled" tone="neutral" icon={Ban}>{inactiveLabel}</StampBadge>;
}
