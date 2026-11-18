import { BadRequestException, ForbiddenException, Injectable, type PipeTransform } from '@nestjs/common';
import { claimsOf, FHIR_ID_PATTERN, type RequestWithClaims, requirePatientRef } from '@medcenter/common';

const PATIENT_REFERENCE = /^Patient\/((?!\.+$)[A-Za-z0-9\-.]{1,64})$/;

/** The SMART `patient` claim is a bare id while `Communication.recipient` is `Patient/{id}`; anything else fails closed. */
export function patientReferenceOf(request: RequestWithClaims): string {
  const claim = requirePatientRef(claimsOf(request));
  if (FHIR_ID_PATTERN.test(claim)) {
    return `Patient/${claim}`;
  }
  if (PATIENT_REFERENCE.test(claim)) {
    return claim;
  }
  throw new ForbiddenException({ errorCode: 'COMPARTMENT_VIOLATION', message: 'Token carries an invalid patient context' });
}

/** Path `{id}` must be a FHIR `id`: junk is answered `400 VALIDATION_ERROR` instead of reaching HAPI. */
@Injectable()
export class FhirIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!FHIR_ID_PATTERN.test(value)) {
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        message: 'id must be a FHIR resource id ([A-Za-z0-9-.]{1,64})',
      });
    }
    return value;
  }
}
