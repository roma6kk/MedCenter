import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { FHIR_CLIENT, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { MEDCENTER_EXT } from '@medcenter/terminology';

import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import type { RoomResponseDto } from './dto/room-response.dto';
import { roomScheduleQuery } from './room-schedules';

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

  async list(page = 1, pageSize = 20): Promise<RoomResponseDto[]> {
    const result = await this.fhirClient.search('Location', {
      'physical-type': 'room',
      _count: pageSize,
      _offset: (page - 1) * pageSize,
    });
    return (result.entry ?? []).map((entry) => this.toResponseDto(entry.resource));
  }

  async findById(id: string): Promise<RoomResponseDto> {
    const resource = await this.fhirClient.read('Location', id);
    return this.toResponseDto(resource);
  }

  async create(dto: CreateRoomDto): Promise<RoomResponseDto> {
    const created = await this.fhirClient.create('Location', this.toLocation(dto));
    return this.toResponseDto(created);
  }

  async update(id: string, dto: UpdateRoomDto): Promise<RoomResponseDto> {
    const existing = await this.fhirClient.read('Location', id);
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
    const updated = await this.fhirClient.update('Location', id, merged as FhirResource);
    return this.toResponseDto(updated);
  }

  /**
   * Refuses to delete a room referenced by any schedule (active or not — HAPI
   * keeps referential integrity on delete, so a deactivated schedule pins the
   * room too). Busy slots are protected (BR-001); the contract is 409 `ROOM_IN_USE`
   * (API §4.6).
   *
   * `ROOM_IN_USE` is not in `ERROR_CODES` (libs/contracts) yet, and
   * `ProblemDetailsFilter` only promotes codes from that list: the client gets
   * `409` with `errorCode: CONFLICT` and the label survives in `detail` (the
   * message below). Once the code is added to the contract it becomes the
   * `errorCode` without a change here.
   */
  async remove(id: string): Promise<void> {
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
    await this.fhirClient.delete('Location', id);
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
          {
            system: 'http://terminology.hl7.org/CodeSystem/location-physical-type',
            code: 'ro',
            display: 'room',
          },
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
