import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';

export interface FreeSlot {
  readonly doctorId: string;
  readonly doctorName: string;
  readonly slotId: string;
  readonly serviceId?: string;
  readonly start: string;
  readonly end: string;
}

interface DoctorItem {
  readonly id: string;
  readonly name: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly middleName?: string;
  readonly practitionerRoleIds?: ReadonlyArray<string>;
}

interface SlotItem {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly status: string;
  readonly serviceId?: string;
}

const SLOT_WINDOW_DAYS = 13;
/** Slots that start sooner than this are skipped: they may fall inside a booking/cancellation lead time. */
const MIN_LEAD_MS = 36 * 60 * 60 * 1000;

function shuffle<T>(items: ReadonlyArray<T>): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

export function clinicDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function displayName(doctor: DoctorItem): string {
  const parts = [doctor.lastName, doctor.firstName, doctor.middleName].filter((part): part is string => (part ?? '').trim() !== '');
  return parts.length > 0 ? parts.join(' ') : doctor.name;
}

export async function revealSlotOnDoctorPage(page: Page, slot: FreeSlot): Promise<void> {
  if (slot.serviceId !== undefined) {
    const chip = page.getByTestId(`service-chip-${slot.serviceId}`);
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  }
  await page.getByTestId(`slot-day-chip-${clinicDay(new Date(slot.start))}`).click();
}

export async function findFreeSlots(request: APIRequestContext, count: number, practitionerRoleId?: string): Promise<FreeSlot[]> {
  const doctorsResponse = await request.get('/api/v1/doctors?pageSize=100');
  if (!doctorsResponse.ok()) throw new Error(`GET /api/v1/doctors answered ${doctorsResponse.status()}`);
  const doctors = ((await doctorsResponse.json()) as { items: ReadonlyArray<DoctorItem> }).items.filter(
    (doctor) => practitionerRoleId === undefined || doctor.practitionerRoleIds?.includes(practitionerRoleId) === true,
  );
  const from = clinicDay(new Date(Date.now() + MIN_LEAD_MS));
  const to = clinicDay(new Date(Date.now() + SLOT_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const earliest = Date.now() + MIN_LEAD_MS;
  const found: FreeSlot[] = [];
  for (const doctor of shuffle(doctors)) {
    const slotsResponse = await request.get(`/api/v1/doctors/${encodeURIComponent(doctor.id)}/slots?from=${from}&to=${to}`);
    if (!slotsResponse.ok()) continue;
    const slots = ((await slotsResponse.json()) as { items: ReadonlyArray<SlotItem> }).items.filter(
      (slot) => slot.status === 'free' && Date.parse(slot.start) >= earliest,
    );
    const picks = shuffle(slots).slice(0, practitionerRoleId === undefined ? 1 : count - found.length);
    for (const slot of picks) {
      found.push({ doctorId: doctor.id, doctorName: displayName(doctor), slotId: slot.id, start: slot.start, end: slot.end, ...(slot.serviceId === undefined ? {} : { serviceId: slot.serviceId }) });
    }
    if (found.length >= count) break;
  }
  if (found.length < count) throw new Error(`Only ${found.length} free slot(s) found, ${count} needed; run "npm run seed:demo" (without --users).`);
  return found;
}

export async function accessTokenOf(page: Page): Promise<string> {
  const response = await page.request.get('/api/auth/session');
  if (!response.ok()) throw new Error(`GET /api/auth/session answered ${response.status()}`);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

export async function authHeaders(page: Page): Promise<{ readonly Authorization: string }> {
  return { Authorization: `Bearer ${await accessTokenOf(page)}` };
}

export async function findFreeSlot(request: APIRequestContext): Promise<FreeSlot> {
  const [slot] = await findFreeSlots(request, 1);
  if (slot === undefined) throw new Error('no free slot');
  return slot;
}

export async function bookSlotAs(page: Page, slotId: string): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
  const response = await page.request.post('/api/v1/appointments', {
    headers: { ...(await authHeaders(page)), 'Idempotency-Key': randomUUID() },
    data: { slotId },
  });
  return { status: response.status(), body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

export async function cancelAppointmentAs(page: Page, appointmentId: string, reason = 'other'): Promise<void> {
  await page.request.post(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    headers: await authHeaders(page),
    data: { reason },
  });
}

export async function bookAnyFreeSlotAs(page: Page, attempts = 5): Promise<{ readonly id: string; readonly slot: FreeSlot }> {
  for (let attempt = 1; ; attempt += 1) {
    const slot = await findFreeSlot(page.request);
    const booked = await bookSlotAs(page, slot.slotId);
    if (booked.status === 201) return { id: String(booked.body['id']), slot };
    if (booked.status !== 409 || attempt >= attempts) throw new Error(`POST /api/v1/appointments answered ${booked.status} for a free slot (attempt ${attempt})`);
  }
}
