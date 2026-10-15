import { BadRequestException, ForbiddenException, Injectable, type PipeTransform } from '@nestjs/common';
import { claimsOf, requirePatientRef, type RequestWithClaims } from '@medcenter/common';

/**
 * FHIR R4 `id`: `[A-Za-z0-9\-.]{1,64}`. Dot-only values (`.`, `..`) are refused
 * on top of that: as a URL path segment they collapse `Communication/{id}` into
 * the FHIR base URL, so they can never name a resource.
 */
export const FHIR_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9\-.]{1,64}$/;

const PATIENT_REFERENCE = /^Patient\/((?!\.+$)[A-Za-z0-9\-.]{1,64})$/;

/**
 * Patient compartment of the caller as `Patient/{id}`, from the token only
 * (ADR-013). The SMART `patient` claim is a bare Patient id (auth-service
 * contract) while `Communication.recipient` holds `Patient/{id}`: comparing or
 * searching with the bare id would never match the caller's own notifications.
 * A claim that is already a Patient reference is accepted; anything else fails closed.
 */
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
