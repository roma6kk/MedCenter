import type { FhirResource } from '@medcenter/fhir';
import { DEFAULT_CONTENT_LANGUAGE, translated, type ContentLanguage } from '@medcenter/fhir-mappers';

import { referenceIdOf } from '../../../common/fhir/fhir-reference';
import { firstCoding, referenceField, stringField } from '../../../common/fhir/fhir-read';
import { ofType, rankedDiagnoses, relatedTo } from '../../encounters/mappers/clinical-view.mapper';
import { toEncounterResponse } from '../../encounters/mappers/encounter-view.mapper';
import type { HistoryItemDto } from '../dto/history-item.dto';

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Display form of the first `HumanName`: `text`, else `family given…` — the same as `doctorName` in appointment-service.
 * In English the translated `family`/`given` (HL7 `translation` extension, as in the doctor catalog) win over the
 * stored Russian `text`; Russian and a missing translation keep the stored value.
 */
function humanNameOf(resource: FhirResource | undefined, lang: ContentLanguage): string | undefined {
  const first = (Array.isArray(resource?.['name']) ? resource['name'] : [])[0] as Record<string, unknown> | undefined;
  if (first === undefined) {
    return undefined;
  }
  const given = Array.isArray(first['given']) ? (first['given'] as unknown[]) : [];
  const givenElements = Array.isArray(first['_given']) ? (first['_given'] as unknown[]) : [];
  const stored = [first['family'], ...given].filter(nonEmpty);
  const parts = [
    nonEmpty(first['family']) ? translated(first['family'], first['_family'], lang) : undefined,
    ...given.map((name, index) => (nonEmpty(name) ? translated(name, givenElements[index], lang) : undefined)),
  ].filter(nonEmpty);
  if (nonEmpty(first['text']) && parts.join(' ') === stored.join(' ')) {
    return translated(first['text'], first['_text'], lang);
  }
  return parts.length === 0 ? undefined : parts.join(' ');
}

/** The Practitioner behind the encounter's PractitionerRole, when the Bundle carries both. */
function doctorNameOf(roleId: string, related: readonly FhirResource[], lang: ContentLanguage): string | undefined {
  const role = related.find((resource) => resource.resourceType === 'PractitionerRole' && resource.id === roleId);
  const practitionerId = referenceIdOf(referenceField(role, 'practitioner'), 'Practitioner');
  return humanNameOf(
    related.find((resource) => resource.resourceType === 'Practitioner' && resource.id === practitionerId),
    lang,
  );
}

/** A finished encounter and the `_revinclude`d resources of the page → one history item. */
export function toHistoryItem(
  encounter: FhirResource,
  related: readonly FhirResource[],
  lang: ContentLanguage = DEFAULT_CONTENT_LANGUAGE,
): HistoryItemDto {
  const own = relatedTo(`Encounter/${encounter.id ?? ''}`, related);
  const diagnoses = rankedDiagnoses(encounter, ofType(own, 'Condition'));
  const response = toEncounterResponse(encounter, diagnoses.map((diagnosis) => diagnosis.code));
  const summary = stringField(ofType(own, 'ClinicalImpression')[0], 'summary');
  const recommendations = stringField(ofType(own, 'CarePlan')[0], 'description');
  const serviceType = firstCoding(encounter, 'serviceType');
  const doctorName = doctorNameOf(response.practitionerRoleId, related, lang);
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
    ...(doctorName === undefined ? {} : { doctorName }),
  };
}
