import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

import { FHIR_ID_PATTERN } from './fhir-reference';

/**
 * Path `{id}` must be a FHIR `id`. Besides rejecting junk early with
 * `400 VALIDATION_ERROR` (instead of a HAPI 400 surfacing as 500), it keeps a
 * comma out of `_id=` searches, where `a,b` would mean "a OR b".
 */
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
