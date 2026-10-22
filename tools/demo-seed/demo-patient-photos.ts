import type { FhirHttp, FhirResource } from '../shared/fhir-http';
import { PATIENTS, patientPhotoUrl, type PatientDef } from './demo-catalog';

/**
 * auth-service creates the FHIR `Patient` of a self-registered account, so the
 * portrait cannot ride along with the reference data: once the accounts exist,
 * each demo patient is found by name and birth date and gets `photo[0]`.
 */

export interface PatientPhotoSummary {
  readonly updated: readonly string[];
  readonly unchanged: readonly string[];
  /** Demo patients with no `Patient` on the server (account not registered yet). */
  readonly missing: readonly string[];
}

export function withPhoto(patient: FhirResource, def: PatientDef): FhirResource {
  const photo = { contentType: 'image/jpeg', url: patientPhotoUrl(def), title: `${def.lastName} ${def.firstName}` };
  return { ...patient, photo: [photo] };
}

function samePhoto(patient: FhirResource, def: PatientDef): boolean {
  const photos = patient['photo'];
  return Array.isArray(photos) && photos.length === 1 && (photos[0] as { url?: unknown }).url === patientPhotoUrl(def);
}

export async function attachPatientPhotos(http: FhirHttp, defs: readonly PatientDef[] = PATIENTS): Promise<PatientPhotoSummary> {
  const updated: string[] = [];
  const unchanged: string[] = [];
  const missing: string[] = [];
  for (const def of defs) {
    const found = await http.search('Patient', { family: def.lastName, given: def.firstName, birthdate: def.birthDate });
    if (found.length === 0) {
      missing.push(def.emailLocal);
      continue;
    }
    for (const patient of found) {
      if (samePhoto(patient, def)) {
        unchanged.push(def.emailLocal);
      } else {
        await http.put(withPhoto(patient, def));
        updated.push(def.emailLocal);
      }
    }
  }
  return { updated, unchanged, missing };
}
