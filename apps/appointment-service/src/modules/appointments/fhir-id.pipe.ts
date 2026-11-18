import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { FHIR_ID_PATTERN } from '@medcenter/common';

/** Rejects junk with 400 and keeps a comma out of `_id=` searches, where `a,b` means OR. */
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
