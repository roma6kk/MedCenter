import type { FhirResource } from '@medcenter/fhir';

import { firstCoding, stringField } from '../../../common/fhir/fhir-read';
import { ofType, rankedDiagnoses, relatedTo } from '../../encounters/mappers/clinical-view.mapper';
import { toEncounterResponse } from '../../encounters/mappers/encounter-view.mapper';
import type { HistoryItemDto } from '../dto/history-item.dto';

/** A finished encounter and the `_revinclude`d resources of the page → one history item. */
export function toHistoryItem(encounter: FhirResource, related: readonly FhirResource[]): HistoryItemDto {
  const own = relatedTo(`Encounter/${encounter.id ?? ''}`, related);
  const diagnoses = rankedDiagnoses(encounter, ofType(own, 'Condition'));
  const response = toEncounterResponse(encounter, diagnoses.map((diagnosis) => diagnosis.code));
  const summary = stringField(ofType(own, 'ClinicalImpression')[0], 'summary');
  const recommendations = stringField(ofType(own, 'CarePlan')[0], 'description');
  const serviceType = firstCoding(encounter, 'serviceType');
  return {
    id: response.id,
    date: response.period.start,
    ...(response.period.end === undefined ? {} : { endDate: response.period.end }),
    status: response.status,
    diagnosis: diagnoses[0]?.code ?? '',
    diagnoses,
    ...(summary === undefined ? {} : { summary }),
    ...(recommendations === undefined ? {} : { recommendations }),
    ...(serviceType === undefined ? {} : { serviceType }),
    appointmentId: response.appointmentId,
    practitionerRoleId: response.practitionerRoleId,
  };
}
