/**
 * booking-api — the live-stack calls the patient scenarios need around the UI: finding a free slot at run time and
 * booking / cancelling through the same-origin `/api/v1/*` proxy with the session of a signed-in page.
 *
 * Nothing is hardcoded: the doctors and slots come from the public catalog, and the candidates are shuffled so parallel
 * specs do not all fight over the first free slot. The access token is read from the token broker (`/api/auth/session`)
 * and is never logged or attached.
 */
import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';

export interface FreeSlot {
  readonly doctorId: string;
  readonly doctorName: string;
  readonly slotId: string;
  readonly start: string;
  readonly end: string;
}

interface DoctorItem {
  readonly id: string;
  readonly name: string;
  readonly practitionerRoleIds?: ReadonlyArray<string>;
}

interface SlotItem {
  readonly id: string;
  readonly start: string;
  readonly end: string;
  readonly status: string;
}

export interface BookedAppointment {
  readonly id: string;
  readonly status: string;
}

/** The slot picker shows 14 clinic days from today; the last one is today + 13. */
const SLOT_WINDOW_DAYS = 13;
/** Slots that start sooner than this are skipped: they may fall inside a booking/cancellation lead time or the current day's tail. */
const MIN_LEAD_MS = 36 * 60 * 60 * 1000;

function shuffle<T>(items: ReadonlyArray<T>): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

/** The clinic calendar day (`YYYY-MM-DD`, Europe/Minsk) of an instant; the doctor journal is addressed by it (`?date=`). */
export function clinicDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Up to `count` free slots of distinct doctors where possible; `practitionerRoleId` narrows the search to one doctor (a seeded doctor account). */
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
    // One slot per doctor, except when a single doctor was asked for: then all of the slots come from them.
    const picks = shuffle(slots).slice(0, practitionerRoleId === undefined ? 1 : count - found.length);
    for (const slot of picks) found.push({ doctorId: doctor.id, doctorName: doctor.name, slotId: slot.id, start: slot.start, end: slot.end });
    if (found.length >= count) break;
  }
  if (found.length < count) throw new Error(`Only ${found.length} free slot(s) found, ${count} needed; run "npm run seed:demo" (without --users).`);
  return found;
}

/** The access token of the page's session (token broker); for Authorization headers of API calls only. */
export async function accessTokenOf(page: Page): Promise<string> {
  const response = await page.request.get('/api/auth/session');
  if (!response.ok()) throw new Error(`GET /api/auth/session answered ${response.status()}`);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

/** `POST /api/v1/appointments` as the signed-in page's user; resolves with the raw response so a 409 can be asserted. */
export async function bookSlotAs(page: Page, slotId: string): Promise<{ readonly status: number; readonly body: Record<string, unknown> }> {
  const token = await accessTokenOf(page);
  const response = await page.request.post('/api/v1/appointments', {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() },
    data: { slotId },
  });
  return { status: response.status(), body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Cleanup: cancels an appointment of the page's user; an already cancelled one (409/4xx) is not an error here. */
export async function cancelAppointmentAs(page: Page, appointmentId: string, reason = 'Очистка после E2E'): Promise<void> {
  const token = await accessTokenOf(page);
  await page.request.post(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { reason },
  });
}

/** Cancels every upcoming booked appointment of the page's user that is on one of the given slot starts. */
export async function cancelBookedAt(page: Page, starts: ReadonlyArray<string>): Promise<void> {
  const token = await accessTokenOf(page);
  const response = await page.request.get('/api/v1/appointments?upcoming=true&status=booked&pageSize=100', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok()) return;
  const items = ((await response.json()) as { items: ReadonlyArray<{ id: string; start: string }> }).items;
  const wanted = new Set(starts.map((start) => Date.parse(start)));
  for (const item of items) if (wanted.has(Date.parse(item.start))) await cancelAppointmentAs(page, item.id);
}
