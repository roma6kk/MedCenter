import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';

import type { NotificationResponseDto } from './dto/notification-response.dto';

export interface ListNotificationsQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly unreadOnly: boolean;
}

/** `Communication.status` is `in-progress` while unread and `completed` once read. */
const UNREAD = 'in-progress';
const READ = 'completed';

/** Read-all handles at most this many unread notifications per call (one FHIR batch). */
export const READ_ALL_LIMIT = 200;

/** The id of the first `Communication.about` reference to `resourceType`, if any. */
function aboutId(communication: FhirResource, resourceType: string): string | undefined {
  const about = (communication['about'] as Array<{ reference?: unknown }> | undefined) ?? [];
  const prefix = `${resourceType}/`;
  const reference = about.map((item) => item.reference).find((value): value is string => typeof value === 'string' && value.startsWith(prefix));
  return reference === undefined ? undefined : reference.slice(prefix.length);
}

function toDto(communication: FhirResource): NotificationResponseDto {
  const appointmentId = aboutId(communication, 'Appointment');
  const encounterId = aboutId(communication, 'Encounter');
  const payload = (communication['payload'] as Array<{ contentString?: unknown }> | undefined) ?? [];
  const category = (communication['category'] as Array<{ text?: unknown }> | undefined) ?? [];
  const text = payload[0]?.contentString;
  const categoryText = category[0]?.text;
  return {
    id: communication.id ?? '',
    category: typeof categoryText === 'string' ? categoryText : '',
    text: typeof text === 'string' ? text : '',
    sent: typeof communication['sent'] === 'string' ? communication['sent'] : '',
    read: communication['status'] === READ,
    ...(appointmentId === undefined ? {} : { appointmentId }),
    ...(encounterId === undefined ? {} : { encounterId }),
  };
}

/**
 * Patient-facing reads over `Communication` (API §8). Notifications are stored
 * in HAPI, so there is no separate notification database (architect §4.4).
 * The patient is always the compartment from the token (ADR-013).
 */
@Injectable()
export class NotificationsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  /**
   * API §8.1 in the listing envelope of API §0. `_offset` is the FHIR search
   * paging parameter (`_getpagesoffset` only exists on HAPI's own page links, so
   * page 2 used to repeat page 1); `_total=accurate` supplies `totalItems`.
   */
  async list(patientRef: string, query: ListNotificationsQuery): Promise<PaginatedResponseDto<NotificationResponseDto>> {
    const result = await this.fhir.search('Communication', {
      recipient: patientRef,
      _sort: '-sent',
      _count: query.pageSize,
      _offset: (query.page - 1) * query.pageSize,
      _total: 'accurate',
      ...(query.unreadOnly ? { status: UNREAD } : {}),
    });
    const items = (result.entry ?? []).map((entry) => toDto(entry.resource));
    // Without `total` the count is at least what the pages up to this one hold.
    const totalItems = result.total ?? (query.page - 1) * query.pageSize + items.length;
    return buildPaginatedResponse(items, {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    });
  }

  async unreadCount(patientRef: string): Promise<number> {
    const result = await this.fhir.search('Communication', {
      recipient: patientRef,
      status: UNREAD,
      _summary: 'count',
    });
    return result.total ?? 0;
  }

  /** Marks a notification read. Only the recipient may do it (COMPARTMENT_VIOLATION otherwise). */
  async markRead(patientRef: string, id: string): Promise<void> {
    const communication = await this.fhir.read('Communication', id);
    const recipients = (communication['recipient'] as Array<{ reference?: unknown }> | undefined) ?? [];
    if (!recipients.some((recipient) => recipient.reference === patientRef)) {
      throw new ForbiddenException({
        errorCode: 'COMPARTMENT_VIOLATION',
        message: 'Notification belongs to another patient',
      });
    }
    await this.fhir.update('Communication', id, { ...communication, status: READ });
  }

  /**
   * API §8.4: marks every unread notification of the caller read, up to {@link READ_ALL_LIMIT} per call, in one FHIR
   * `batch` of `PUT`s under `If-Match` (a notification changed meanwhile simply stays as it is). The search is the
   * patient's own compartment, so no other recipient's notification can be touched. Returns how many became read.
   */
  async markAllRead(patientRef: string): Promise<number> {
    const result = await this.fhir.search('Communication', { recipient: patientRef, status: UNREAD, _count: READ_ALL_LIMIT });
    const unread = (result.entry ?? []).map((entry) => entry.resource).filter((resource) => resource.id !== undefined);
    if (unread.length === 0) {
      return 0;
    }
    const answer = await this.fhir.batch({
      resourceType: 'Bundle',
      type: 'batch',
      entry: unread.map((communication) => {
        const versionId = (communication['meta'] as { versionId?: string } | undefined)?.versionId;
        return {
          resource: { ...communication, status: READ },
          request: { method: 'PUT', url: `Communication/${communication.id ?? ''}`, ...(versionId === undefined ? {} : { ifMatch: `W/"${versionId}"` }) },
        };
      }),
    });
    const responses = (answer['entry'] as Array<{ response?: { status?: string } }> | undefined) ?? [];
    return responses.filter((entry) => /^2\d\d/.test(entry.response?.status ?? '')).length;
  }
}
