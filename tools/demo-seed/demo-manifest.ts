import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { DOCTORS, ROOMS, SCHEDULES, SERVICES, type DayCode } from './demo-catalog';
import { demoIds } from './demo-ids';
import { fullNameOf, windowsOf } from './demo-resources';
import { specialtyOf } from './demo-lookup';
import type { DemoFhirSummary } from './seed-demo-fhir';

/**
 * The demo manifest: the ids and (for accounts this tool created) the
 * credentials of the seeded demo. It lives in `tools/demo-seed/output/`, which
 * is git-ignored — it is the *only* place a generated password is ever written.
 */

export interface DemoUserRecord {
  readonly role: 'ADMIN' | 'DOCTOR' | 'PATIENT';
  readonly email: string;
  /** Present only for accounts created by this tool (never for the bootstrap admin). */
  readonly password?: string;
  readonly userId?: string;
  /** `PractitionerRole.id` a DOCTOR account is linked to. */
  readonly practitionerRoleId?: string;
  readonly status: 'created' | 'exists' | 'failed';
  readonly detail?: string;
}

export interface DemoUsersSection {
  readonly generatedAt: string;
  readonly authBaseUrl: string;
  readonly accounts: readonly DemoUserRecord[];
}

export interface DemoFhirManifest {
  readonly generatedAt: string;
  readonly fhirBaseUrl: string;
  readonly organizationId: string;
  readonly rooms: ReadonlyArray<{ key: string; id: string; identifier: string; name: string }>;
  readonly practitioners: ReadonlyArray<{ key: string; id: string; fullName: string }>;
  readonly practitionerRoles: ReadonlyArray<{
    key: string;
    id: string;
    practitionerId: string;
    specialty: { system: string; code: string; display: string };
    healthcareServiceIds: string[];
    roomIds: string[];
  }>;
  readonly healthcareServices: ReadonlyArray<{ key: string; id: string; name: string; typeCode: string; durationMin: number }>;
  readonly schedules: ReadonlyArray<{
    key: string;
    id: string;
    practitionerRoleId: string;
    roomId: string;
    healthcareServiceId: string;
    slotDurationMin: number;
    /** Weekly windows in clinic wall-clock time (Europe/Minsk), exactly as stored in the Schedule. */
    windows: ReadonlyArray<{ dayOfWeek: DayCode; startTime: string; endTime: string }>;
    /** Slots the schedule should hold over the horizon (those that had not started at run time). */
    slotsPlanned: number;
    /** Slots the latest run had to create; `0` on a re-run means everything was already there. */
    slotsCreated: number;
  }>;
  readonly horizon: { from: string; to: string };
}

/** The whole file: the FHIR part and the users part are written by separate steps and never clobber each other. */
export interface DemoManifest extends Partial<DemoFhirManifest> {
  readonly users?: DemoUsersSection;
}

const SNOMED_CT = 'http://snomed.info/sct';

function roleEntries(): DemoFhirManifest['practitionerRoles'] {
  return DOCTORS.map((doctor) => {
    const specialty = specialtyOf(doctor.specialtyKey);
    const own = SCHEDULES.filter((schedule) => schedule.doctorKey === doctor.key);
    return {
      key: doctor.key,
      id: demoIds.practitionerRole(doctor.key),
      practitionerId: demoIds.practitioner(doctor.key),
      specialty: { system: SNOMED_CT, code: specialty.code, display: specialty.display },
      healthcareServiceIds: [...new Set(own.map((schedule) => demoIds.service(schedule.serviceKey)))],
      roomIds: [...new Set(own.map((schedule) => demoIds.room(schedule.roomKey)))],
    };
  });
}

function scheduleEntries(summary: DemoFhirSummary): DemoFhirManifest['schedules'] {
  return SCHEDULES.map((schedule) => {
    const slots = summary.slots.find((candidate) => candidate.scheduleKey === schedule.key);
    return {
      key: schedule.key,
      id: demoIds.schedule(schedule.key),
      practitionerRoleId: demoIds.practitionerRole(schedule.doctorKey),
      roomId: demoIds.room(schedule.roomKey),
      healthcareServiceId: demoIds.service(schedule.serviceKey),
      slotDurationMin: schedule.slotDurationMin,
      windows: windowsOf(schedule),
      slotsPlanned: slots?.planned ?? 0,
      slotsCreated: slots?.created ?? 0,
    };
  });
}

/** Pure: the FHIR half of the manifest from the static catalog and the run summary. */
export function buildFhirManifest(summary: DemoFhirSummary, fhirBaseUrl: string, generatedAt: string): DemoFhirManifest {
  return {
    generatedAt,
    fhirBaseUrl,
    organizationId: demoIds.organization(),
    rooms: ROOMS.map((room) => ({ key: room.key, id: demoIds.room(room.key), identifier: room.identifier, name: room.name })),
    practitioners: DOCTORS.map((doctor) => ({ key: doctor.key, id: demoIds.practitioner(doctor.key), fullName: fullNameOf(doctor) })),
    practitionerRoles: roleEntries(),
    healthcareServices: SERVICES.map((service) => ({
      key: service.key,
      id: demoIds.service(service.key),
      name: service.name,
      typeCode: service.typeCode,
      durationMin: service.durationMin,
    })),
    schedules: scheduleEntries(summary),
    horizon: summary.horizon,
  };
}

/** The manifest on disk, `{}` when there is none yet. A corrupt file is an error, not an empty manifest. */
export async function readManifest(path: string): Promise<DemoManifest> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed as DemoManifest;
}

/**
 * Merges `patch` over the manifest on disk (top-level keys), so one step never
 * drops the other's output. The file is replaced atomically (temporary file in
 * the same directory, then `rename`): an interrupted write leaves the previous
 * manifest — and the generated passwords in it — intact instead of a truncated
 * JSON that `readManifest` would then refuse. The fresh file is `0600` every
 * time, not only when the manifest is first created.
 */
export async function writeManifest(path: string, patch: DemoManifest): Promise<DemoManifest> {
  const merged: DemoManifest = { ...(await readManifest(path)), ...patch };
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(merged, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return merged;
}
