import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import {
  createAudited,
  deleteAudited,
  FHIR_CLIENT,
  updateAudited,
  type AuditContext,
  type FhirClient,
  type FhirResource,
  type WriteActor,
} from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { toPage } from '../../common/page-envelope';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import type { RoomResponseDto } from './dto/room-response.dto';
import { roomUsingIdentifier } from './room-identifier';
import { roomScheduleQuery } from './room-schedules';
import { findAllRooms, LOCATION_PHYSICAL_TYPE_SYSTEM, ROOM_PHYSICAL_TYPE_CODE } from './room-search';

/** One page of the room list in the API §0 envelope. */
export type RoomPage = PaginatedResponseDto<RoomResponseDto>;

/** `AuditEvent.source` of the writes of this service. */
const AUDIT_SOURCE = 'practitioner-service';

/** FHIR R4 `Location` has no native floor element — it lives in an extension. */
const FLOOR_EXT = MEDCENTER_EXT.ROOM_FLOOR;

/**
 * Admin CRUD over `Location` resources whose `physicalType` is `room`
 * (API §4.3–4.7, FR-017).
 *
 * The delete path protects busy slots: a room referenced by any `Schedule`
 * is never removed (BR-001) — the caller gets `409 ROOM_IN_USE`, and
 * `GET /admin/rooms/{id}/usage` (API §4.7) lists exactly those schedules.
 */
@Injectable()
export class RoomsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  /** The page is cut from the room list itself, so the total counts rooms only (see {@link findAllRooms}). */
  async list(page = 1, pageSize = 20): Promise<RoomPage> {
    const rooms = await findAllRooms(this.fhirClient);
    const offset = (page - 1) * pageSize;
    const items = rooms.slice(offset, offset + pageSize).map((room) => this.toResponseDto(room));
    return toPage(items, page, pageSize, rooms.length);
  }

  async findById(id: string): Promise<RoomResponseDto> {
    const resource = await this.fhirClient.read('Location', id);
    return this.toResponseDto(resource);
  }

  /** Admin writes carry their `AuditEvent` in the same transaction (FR-021, ADR-014). */
  private auditOf(actor: WriteActor): AuditContext {
    return { actor, source: AUDIT_SOURCE };
  }

  async create(dto: CreateRoomDto, actor: WriteActor): Promise<RoomResponseDto> {
    await this.assertIdentifierFree(dto.identifier);
    const created = await createAudited(this.fhirClient, this.toLocation(dto), this.auditOf(actor));
    return this.toResponseDto(created);
  }

  async update(id: string, dto: UpdateRoomDto, actor: WriteActor): Promise<RoomResponseDto> {
    const existing = await this.fhirClient.read('Location', id);
    if (dto.identifier !== undefined) {
      await this.assertIdentifierFree(dto.identifier, id);
    }
    // Merge skips undefined: absent DTO fields must not blank existing values.
    // `floor` is excluded from the plain merge: it lives inside an extension,
    // and the whole `extension` array of the patch would overwrite unrelated
    // stored extensions — it is merged per-entry below instead.
    const merged: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(this.toLocation(dto))) {
      if (value !== undefined && key !== 'extension') {
        merged[key] = value;
      }
    }
    // `floor` lives in an extension: merge it separately so an absent field
    // keeps the stored extension while a supplied one replaces just its entry.
    if (dto.floor !== undefined) {
      const extensions = (Array.isArray(merged['extension'])
        ? (merged['extension'] as Array<Record<string, unknown>>).filter(
            (ext) => ext['url'] !== FLOOR_EXT,
          )
        : []
      ).concat([{ url: FLOOR_EXT, valueInteger: dto.floor }]);
      merged['extension'] = extensions;
    }
    const updated = await updateAudited(this.fhirClient, { ...merged, id } as FhirResource, this.auditOf(actor));
    return this.toResponseDto(updated);
  }

  /**
   * Refuses to delete a room referenced by any schedule (active or not — HAPI
   * keeps referential integrity on delete, so a deactivated schedule pins the
   * room too). Busy slots are protected (BR-001); the contract is 409 `ROOM_IN_USE`
   * (API §4.6).
   *
   * `ROOM_IN_USE` is catalogued in `ERROR_CODES` (libs/contracts), so
   * `ProblemDetailsFilter` promotes it to the response `errorCode`; the same
   * label stays at the start of `detail` for logs and older clients.
   */
  async remove(id: string, actor: WriteActor): Promise<void> {
    // An unknown id surfaces as 404 NOT_FOUND straight from the FHIR client.
    await this.fhirClient.read('Location', id);
    // `_count: 1` — one referencing schedule is enough to refuse the delete.
    // Same query as the usage view (API §4.7), so both always agree.
    const schedules = await this.fhirClient.search('Schedule', {
      ...roomScheduleQuery(id),
      _count: 1,
    });
    if ((schedules.entry ?? []).length > 0) {
      throw new ConflictException({
        errorCode: 'ROOM_IN_USE',
        message: `ROOM_IN_USE: room ${id} is referenced by a schedule`,
      });
    }
    await deleteAudited(this.fhirClient, 'Location', id, this.auditOf(actor));
  }

  /**
   * `409 CONFLICT` when another room already has `identifier` (API §4.4/4.5, compared trimmed and
   * case-insensitively). HAPI has no unique constraint over `Location.identifier`, so the rooms are
   * read and compared here; two admins creating the same identifier in the same instant is the one
   * case this check cannot see (admin-only, low-frequency writes).
   */
  private async assertIdentifierFree(identifier: string, roomId?: string): Promise<void> {
    const taken = roomUsingIdentifier(await findAllRooms(this.fhirClient), identifier, roomId);
    if (taken !== undefined) {
      throw this.identifierTaken(identifier, taken.id ?? '');
    }
  }

  private identifierTaken(identifier: string, roomId: string): ConflictException {
    return new ConflictException({
      errorCode: 'CONFLICT',
      message: `CONFLICT: room identifier "${identifier}" is already used by room ${roomId}`,
    });
  }

  private toLocation(dto: Partial<CreateRoomDto>): FhirResource {
    return {
      resourceType: 'Location',
      identifier: dto.identifier === undefined ? undefined : [{ value: dto.identifier }],
      name: dto.name,
      description: dto.description,
      ...(dto.floor === undefined
        ? {}
        : { extension: [{ url: FLOOR_EXT, valueInteger: dto.floor }] }),
      physicalType: {
        coding: [
          { system: LOCATION_PHYSICAL_TYPE_SYSTEM, code: ROOM_PHYSICAL_TYPE_CODE, display: 'room' },
        ],
      },
    } as FhirResource;
  }

  private toResponseDto(resource: FhirResource): RoomResponseDto {
    const identifier = Array.isArray(resource['identifier'])
      ? (resource['identifier'] as Array<Record<string, unknown>>)[0]
      : undefined;
    return {
      id: resource.id ?? '',
      identifier: typeof identifier?.['value'] === 'string' ? (identifier['value'] as string) : '',
      name: typeof resource['name'] === 'string' ? (resource['name'] as string) : '',
      description:
        typeof resource['description'] === 'string' ? (resource['description'] as string) : undefined,
      floor: this.readFloor(resource),
      isActive: resource['status'] !== 'inactive',
    };
  }

  private readFloor(resource: FhirResource): number | undefined {
    const extensions = resource['extension'];
    if (!Array.isArray(extensions)) {
      return undefined;
    }
    const floor = (extensions as Array<Record<string, unknown>>).find(
      (ext) => ext['url'] === FLOOR_EXT,
    );
    return typeof floor?.['valueInteger'] === 'number'
      ? (floor['valueInteger'] as number)
      : undefined;
  }
}
