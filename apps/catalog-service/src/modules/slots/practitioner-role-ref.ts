import { ForbiddenException } from '@nestjs/common';
import { FHIR_ID_SOURCE, type JwtClaims } from '@medcenter/common';

const PRACTITIONER_ROLE_REF = new RegExp(`^PractitionerRole/(${FHIR_ID_SOURCE})$`);

/** The PractitionerRole comes from the token's `fhirUser` claim only, never from a parameter. Fails closed. */
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
