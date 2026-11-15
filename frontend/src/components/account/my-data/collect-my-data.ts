import { fetchAppointments } from '@/components/appointments/appointment-api';
import { fetchMyConsent } from '@/components/consent/consent-api';
import { fetchAccount, fetchMyHistory, fetchMyPrescriptions, fetchPatientProfile } from '@/components/patient/patient-api';
import { MAX_PAGE_SIZE, type PaginatedResponse } from '@/lib/api/pagination';
import type { MyDataSources } from './build-my-data-export';

const MAX_PAGES = 50;

async function allPages<TItem>(load: (page: number) => Promise<PaginatedResponse<TItem>>): Promise<ReadonlyArray<TItem>> {
  const items: TItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await load(page);
    items.push(...response.items);
    if (page >= response.meta.totalPages) break;
  }
  return items;
}

export async function collectMyData(): Promise<MyDataSources> {
  const pageSize = MAX_PAGE_SIZE;
  const [account, patient, consent, appointments, encounters, prescriptions] = await Promise.all([
    fetchAccount(),
    fetchPatientProfile(),
    fetchMyConsent(),
    allPages((page) => fetchAppointments({ tab: 'all', page, pageSize })),
    allPages((page) => fetchMyHistory({ page, pageSize })),
    allPages((page) => fetchMyPrescriptions({ page, pageSize })),
  ]);
  return { account, patient, consent, appointments, encounters, prescriptions };
}
