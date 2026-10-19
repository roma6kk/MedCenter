/** `ServiceResponseDto` of `GET /api/v1/services` (api-designer-spec §5.1). */
export interface AdminService {
  readonly id: string;
  readonly name: string;
  readonly typeSystem: string;
  readonly typeCode: string;
  readonly typeDisplay?: string;
  readonly defaultDurationMin: number;
  readonly description?: string;
  readonly isActive: boolean;
}

/** `CreateServiceDto` / `UpdateServiceDto` body. */
export interface ServicePayload {
  readonly name: string;
  readonly typeSystem: string;
  readonly typeCode: string;
  readonly defaultDurationMin: number;
  readonly description?: string;
}
