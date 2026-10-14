import { ForbiddenException } from '@nestjs/common';
import type { JwtClaims } from '@medcenter/common';

import { FHIR_ID_SOURCE } from '../../common/fhir-id';

/** `PractitionerRole/{id}` with a FHIR id (see `FHIR_ID_SOURCE`) and nothing else. */
const PRACTITIONER_ROLE_REF = new RegExp(`^PractitionerRole/(${FHIR_ID_SOURCE})$`);

/**
 * Doctor identity (API §5.2.7, ADR-013): the PractitionerRole comes from the
 * token's `fhirUser` claim only — never from a request parameter. Fails closed:
 * a missing claim, a non-PractitionerRole reference or anything that is not a
 * single well-formed reference is refused, so a gap in the token never widens
 * what a doctor can see.
 */
export function requirePractitionerRoleId(claims: JwtClaims): string {
  const roleId = PRACTITIONER_ROLE_REF.exec(claims.fhirUser ?? '')?.[1];
  if (roleId === undefined) {
    throw new ForbiddenException({
      errorCode: 'COMPARTMENT_VIOLATION',
      message: 'Token carries no PractitionerRole identity',
    });
  }
  return roleId;
}
