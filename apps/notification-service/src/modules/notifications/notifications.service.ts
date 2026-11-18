import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { buildPaginatedResponse, type PaginatedResponseDto } from '@medcenter/contracts';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import type { NotificationResponseDto } from './dto/notification-response.dto';
import { isNotificationKind, NOTIFICATION_KIND_SYSTEM, type NotificationKind } from './notification-kind';

interface ListNotificationsQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly unreadOnly: boolean;
}

const UNREAD = 'in-progress';
const READ = 'completed';

const READ_ALL_LIMIT = 200;

function aboutId(communication: FhirResource, resourceType: string): string | undefined {
  const about = (communication['about'] as Array<{ reference?: unknown }> | undefined) ?? [];
  const prefix = `${resourceType}/`;
  const reference = about.map((item) => item.reference).find((value): value is string => typeof value === 'string' && value.startsWith(prefix));
  return reference === undefined ? undefined : reference.slice(prefix.length);
}

function kindOf(communication: FhirResource): NotificationKind | undefined {
  const topic = communication['topic'] as { coding?: Array<{ system?: unknown; code?: unknown }> } | undefined;
  const code = topic?.coding?.find((coding) => coding.system === NOTIFICATION_KIND_SYSTEM)?.code;
  return isNotificationKind(code) ? code : undefined;
}

function startOf(communication: FhirResource): string | undefined {
  const extensions = (communication['extension'] as Array<{ url?: unknown; valueDateTime?: unknown }> | undefined) ?? [];
  const value = extensions.find((extension) => extension.url === MEDCENTER_EXT.NOTIFICATION_APPOINTMENT_START)?.valueDateTime;
  return typeof value === 'string' ? value : undefined;
}

function toDto(communication: FhirResource): NotificationResponseDto {
  const appointmentId = aboutId(communication, 'Appointment');
  const encounterId = aboutId(communication, 'Encounter');
  const kind = kindOf(communication);
  const start = startOf(communication);
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
    ...(kind === undefined ? {} : { kind }),
    ...(start === undefined ? {} : { start }),
    ...(appointmentId === undefined ? {} : { appointmentId }),
    ...(encounterId === undefined ? {} : { encounterId }),
  };
}

@Injectable()
export class NotificationsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhir: FhirClient) {}

  /** `_offset` is the FHIR paging parameter (`_getpagesoffset` exists only on HAPI's page links); `_total=accurate` gives totalItems. */
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

  /** One FHIR `batch` of PUTs under `If-Match` (a notification changed meanwhile stays as it is); searches the patient's own compartment only. */
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
