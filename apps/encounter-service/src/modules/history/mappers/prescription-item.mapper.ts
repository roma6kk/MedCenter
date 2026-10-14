import type { FhirResource } from '@medcenter/fhir';

import { arrayField, referenceField, stringField } from '../../../common/fhir/fhir-read';
import { referenceIdOf } from '../../../common/fhir/fhir-reference';
import { medicationRequestView, serviceRequestView } from '../../encounters/mappers/clinical-view.mapper';
import type { MedicationPrescriptionDto, ServicePrescriptionDto } from '../dto/prescription-item.dto';

interface PrescriptionBase {
  readonly id: string;
  readonly status: string;
  readonly authoredOn?: string;
  readonly encounterId?: string;
  readonly reasonConditionId?: string;
}

/** Fields both request types share: id, status, authoring date and the BR-005 links. */
function baseOf(request: FhirResource): PrescriptionBase | undefined {
  if (request.id === undefined) {
    return undefined;
  }
  const authoredOn = stringField(request, 'authoredOn');
  const encounterId = referenceIdOf(referenceField(request, 'encounter'), 'Encounter');
  const reasonConditionId = referenceIdOf(stringField(arrayField(request, 'reasonReference')[0], 'reference'), 'Condition');
  return {
    id: request.id,
    status: stringField(request, 'status') ?? 'unknown',
    ...(authoredOn === undefined ? {} : { authoredOn }),
    ...(encounterId === undefined ? {} : { encounterId }),
    ...(reasonConditionId === undefined ? {} : { reasonConditionId }),
  };
}

export function toMedicationPrescription(request: FhirResource): MedicationPrescriptionDto | undefined {
  const base = baseOf(request);
  const view = medicationRequestView(request);
  return base === undefined || view === undefined ? undefined : { ...base, kind: 'medication', ...view };
}

export function toServicePrescription(request: FhirResource): ServicePrescriptionDto | undefined {
  const base = baseOf(request);
  const view = serviceRequestView(request);
  return base === undefined || view === undefined ? undefined : { ...base, kind: 'service', ...view };
}
