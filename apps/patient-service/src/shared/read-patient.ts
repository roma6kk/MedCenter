import { NotFoundException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

export async function readPatient(fhir: FhirClient, id: string): Promise<FhirResource> {
  const patient = await fhir.read('Patient', id);
  if (patient.resourceType !== 'Patient') {
    throw new NotFoundException({ errorCode: 'NOT_FOUND', message: `NOT_FOUND: Patient ${id} does not exist` });
  }
  return patient;
}
