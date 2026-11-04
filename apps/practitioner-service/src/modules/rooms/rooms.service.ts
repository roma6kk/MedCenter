import { isDeepStrictEqual } from 'node:util';

import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { PaginatedResponseDto } from '@medcenter/contracts';
import {
  createAudited,
  deleteAudited,
  FHIR_CLIENT,
  FhirClientError,
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
import { identifierValuesOf, roomIdentifierQuery, roomUsingIdentifier } from './room-identifier';
import { roomScheduleQuery } from './room-schedules';
import { findAllRooms, LOCATION_PHYSICAL_TYPE_SYSTEM, readRoom, ROOM_PHYSICAL_TYPE_CODE } from './room-search';

/** One page of the room list in the API §0 envelope. */
export type RoomPage = PaginatedResponseDto<RoomResponseDto>;

const HTTP_BAD_REQUEST = 400;

/** `AuditEvent.source` of the writes of this service. */
const AUDIT_SOURCE = 'practitioner-service';

/** FHIR R4 `Location` has no native floor element — it lives in an extension. */
const FLOOR_EXT = MEDCENTER_EXT.ROOM_FLOOR;

/** `true` for an absent text, `null` and a text of whitespace only: nothing to store in `Location.description`. */
function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === '';
}

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
    return this.toResponseDto(await readRoom(this.fhirClient, id));
  }

  /** Admin writes carry their `AuditEvent` in the same transaction (FR-021, ADR-014). */
  private auditOf(actor: WriteActor): AuditContext {
    return { actor, source: AUDIT_SOURCE };
  }

  async create(dto: CreateRoomDto, actor: WriteActor): Promise<RoomResponseDto> {
    await this.assertIdentifierFree(dto.identifier);
    try {
      const created = await createAudited(this.fhirClient, this.toLocation(dto), this.auditOf(actor), {
        onlyIfNoneMatches: roomIdentifierQuery(dto.identifier),
      });
      return this.toResponseDto(created);
    } catch (error) {
      // Another request stored a room with this identifier between the check above and the write:
      // HAPI refused this transaction (400 when it matched the stored room, 409 when it met a write in flight).
      if (error instanceof ConflictException || (error instanceof FhirClientError && error.upstreamStatus === HTTP_BAD_REQUEST)) {
        await this.assertIdentifierFree(dto.identifier);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoomDto, actor: WriteActor): Promise<RoomResponseDto> {
    const existing = await readRoom(this.fhirClient, id);
    if (dto.identifier !== undefined) {
      await this.assertIdentifierFree(dto.identifier, id);
    }
    const merged = this.applyPatch(existing, dto);
    // A patch that changes nothing (`{}`, or the stored values sent again) writes no version and no AuditEvent (FR-021).
    if (isDeepStrictEqual(merged, existing)) {
      return this.toResponseDto(existing);
    }
    const updated = await updateAudited(this.fhirClient, { ...merged, id } as FhirResource, this.auditOf(actor));
    return this.toResponseDto(updated);
  }

  /**
   * The stored room with the fields of the patch applied. A field the patch omits keeps its stored value;
   * an optional element the patch empties (a blank `description`, a `null` description or floor) is removed,
   * because FHIR JSON allows neither an empty string nor an empty array and HAPI refuses both.
   *
   * `floor` lives inside an extension, so it is merged entry by entry (the whole `extension` array of the
   * patch would overwrite unrelated stored extensions): a supplied floor replaces just its entry.
   */
  private applyPatch(existing: FhirResource, dto: UpdateRoomDto): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };
    // The stored entry stays as it is while the value is the same: a seeded room carries a `system` the patch does not know.
    const storedIdentifiers = identifierValuesOf(existing);
    if (dto.identifier !== undefined && !(storedIdentifiers.length === 1 && storedIdentifiers[0] === dto.identifier)) {
      merged['identifier'] = [{ value: dto.identifier }];
    }
    if (dto.name !== undefined) {
      merged['name'] = dto.name;
    }
    if (dto.description !== undefined) {
      if (isBlank(dto.description)) {
        delete merged['description'];
      } else {
        merged['description'] = dto.description;
      }
    }
    if (dto.floor !== undefined && (dto.floor ?? undefined) !== this.readFloor(existing)) {
      const others = (Array.isArray(merged['extension']) ? (merged['extension'] as Array<Record<string, unknown>>) : []).filter(
        (ext) => ext['url'] !== FLOOR_EXT,
      );
      const extensions = dto.floor === null ? others : [...others, { url: FLOOR_EXT, valueInteger: dto.floor }];
      if (extensions.length === 0) {
        delete merged['extension'];
      } else {
        merged['extension'] = extensions;
      }
    }
    return merged;
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
    // An unknown id, and a Location that is not a room, surface as 404 NOT_FOUND.
    await readRoom(this.fhirClient, id);
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
   * case this check cannot see; `create` closes it with a conditional create (`roomIdentifierQuery`).
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

  /** The `Location` of a new room; an optional element without a value (absent, `null`, blank) is left out. */
  private toLocation(dto: CreateRoomDto): FhirResource {
    return {
      resourceType: 'Location',
      identifier: [{ value: dto.identifier }],
      name: dto.name,
      ...(isBlank(dto.description) ? {} : { description: dto.description }),
      ...(typeof dto.floor === 'number' ? { extension: [{ url: FLOOR_EXT, valueInteger: dto.floor }] } : {}),
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
