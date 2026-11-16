import type { AppointmentStatus } from '@/components/feedback/stamp-badge';
import type { QueryParams } from '@/lib/api/query-string';
import { clinicDateKey, isDateKey, shiftDateKey } from '@/lib/clinic-time';
import { FHIR_ID_PATTERN } from '../shared/fhir-id';
import { validateReportRange } from '../shared/report-range';

export const ADMIN_APPOINTMENT_STATUSES: ReadonlyArray<AppointmentStatus> = ['booked', 'cancelled', 'noshow', 'fulfilled'];

export const ADMIN_APPOINTMENTS_PAGE_SIZE = 20;

const DEFAULT_DAYS = 30;

export interface AdminAppointmentFilter {
  readonly from: string;
  readonly to: string;
  readonly doctorId: string;
  readonly status: AppointmentStatus | '';
}

export function defaultAdminAppointmentFilter(today: string = clinicDateKey()): AdminAppointmentFilter {
  return { from: today, to: shiftDateKey(today, DEFAULT_DAYS - 1), doctorId: '', status: '' };
}

export function adminAppointmentParams(filter: AdminAppointmentFilter, page: number): QueryParams {
  return {
    from: filter.from,
    to: filter.to,
    practitionerRoleId: filter.doctorId === '' ? undefined : filter.doctorId,
    status: filter.status === '' ? undefined : filter.status,
    page,
    pageSize: ADMIN_APPOINTMENTS_PAGE_SIZE,
    sortOrder: 'asc',
  };
}

function isStatus(value: string): value is AppointmentStatus {
  return ADMIN_APPOINTMENT_STATUSES.some((status) => status === value);
}

export function adminAppointmentFilterFromParams(params: URLSearchParams, today?: string): AdminAppointmentFilter {
  const initial: AdminAppointmentFilter = defaultAdminAppointmentFilter(today);
  const from: string = params.get('from') ?? '';
  const to: string = params.get('to') ?? '';
  const doctor: string = params.get('doctor') ?? '';
  const status: string = params.get('status') ?? '';
  const hasRange: boolean = isDateKey(from) && isDateKey(to) && validateReportRange({ from, to }) === null;
  return {
    from: hasRange ? from : initial.from,
    to: hasRange ? to : initial.to,
    doctorId: FHIR_ID_PATTERN.test(doctor) ? doctor : '',
    status: isStatus(status) ? status : '',
  };
}

export function adminAppointmentFilterToQuery(filter: AdminAppointmentFilter, today?: string): string {
  const initial: AdminAppointmentFilter = defaultAdminAppointmentFilter(today);
  const params = new URLSearchParams();
  if (filter.from !== initial.from || filter.to !== initial.to) {
    params.set('from', filter.from);
    params.set('to', filter.to);
  }
  if (filter.doctorId !== '') params.set('doctor', filter.doctorId);
  if (filter.status !== '') params.set('status', filter.status);
  return params.toString();
}
