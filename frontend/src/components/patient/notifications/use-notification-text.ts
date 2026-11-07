import { useClinicFormat } from '@/hooks/use-clinic-format';
import { useT } from '@/lib/i18n/use-t';
import type { NotificationItem } from '@/lib/notifications/notification-api';

const TEXT_KEYS: Readonly<Record<string, string>> = {
  'appointment.booked': 'booked',
  'appointment.cancelled': 'cancelled',
  'appointment.cancelled.by-admin': 'cancelledByClinic',
  'appointment.noshow': 'noShow',
  'encounter.completed': 'encounterCompleted',
  'patient.registered': 'registered',
};

export function useNotificationText(): (item: Pick<NotificationItem, 'kind' | 'start' | 'text'>) => string {
  const t = useT('patientNotifications.text');
  const format = useClinicFormat();
  return (item) => {
    const key: string | undefined = item.kind === undefined ? undefined : TEXT_KEYS[item.kind];
    if (key === undefined) return format.prose(item.text);
    if (item.kind === 'appointment.booked') return item.start === undefined ? format.prose(item.text) : t(key, { time: format.dateTime(item.start) });
    return t(key);
  };
}
