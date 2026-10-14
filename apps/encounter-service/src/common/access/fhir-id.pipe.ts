import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

import { isFhirId } from './claims-identity';

/** Path `:id` guard: only a FHIR resource id may reach a FHIR read or search. */
@Injectable()
export class FhirIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isFhirId(value)) {
      throw new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: 'id: must be a FHIR resource id' });
    }
    return value;
  }
}
