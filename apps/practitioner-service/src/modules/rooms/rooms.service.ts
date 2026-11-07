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
import { firstRoomReferrer, type RoomReferrerType } from './room-references';
import { findAllRooms, LOCATION_PHYSICAL_TYPE_SYSTEM, readRoom, ROOM_PHYSICAL_TYPE_CODE } from './room-search';

export type RoomPage = PaginatedResponseDto<RoomResponseDto>;

const HTTP_BAD_REQUEST = 400;

const AUDIT_SOURCE = 'practitioner-service';

const FLOOR_EXT = MEDCENTER_EXT.ROOM_FLOOR;

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === '';
}

const REFERRER_TEXT: Readonly<Record<RoomReferrerType, string>> = {
  Schedule: 'a schedule',
  PractitionerRole: 'a doctor role',
  HealthcareService: 'a service',
};

@Injectable()
export class RoomsService {
  constructor(@Inject(FHIR_CLIENT) private readonly fhirClient: FhirClient) {}

  async list(page = 1, pageSize = 20): Promise<RoomPage> {
    const rooms = await findAllRooms(this.fhirClient);
    const offset = (page - 1) * pageSize;
    const items = rooms.slice(offset, offset + pageSize).map((room) => this.toResponseDto(room));
    return toPage(items, page, pageSize, rooms.length);
  }

  async findById(id: string): Promise<RoomResponseDto> {
    return this.toResponseDto(await readRoom(this.fhirClient, id));
  }

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
    // A patch that changes nothing writes no version and no AuditEvent.
    if (isDeepStrictEqual(merged, existing)) {
      return this.toResponseDto(existing);
    }
    const updated = await updateAudited(this.fhirClient, { ...merged, id } as FhirResource, this.auditOf(actor));
    return this.toResponseDto(updated);
  }

  // Emptied optional elements are removed (FHIR JSON allows no empty string); `floor` is merged entry by entry so other extensions survive.
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

  async remove(id: string, actor: WriteActor): Promise<void> {
    await readRoom(this.fhirClient, id);
    const referrer = await firstRoomReferrer(this.fhirClient, id);
    if (referrer !== undefined) {
      throw this.roomInUse(id, REFERRER_TEXT[referrer]);
    }
    try {
      await deleteAudited(this.fhirClient, 'Location', id, this.auditOf(actor));
    } catch (error) {
      // A delete carries no `If-Match`, so its 409 is HAPI keeping a reference: a resource the probes missed points at the room, not a concurrent edit.
      if (error instanceof ConflictException) {
        throw this.roomInUse(id, 'another resource');
      }
      throw error;
    }
  }

  private roomInUse(roomId: string, referrer: string): ConflictException {
    return new ConflictException({
      errorCode: 'ROOM_IN_USE',
      message: `ROOM_IN_USE: room ${roomId} is referenced by ${referrer}`,
    });
  }

  // HAPI has no unique constraint over `Location.identifier`; `create` closes the concurrent case with a conditional create.
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
