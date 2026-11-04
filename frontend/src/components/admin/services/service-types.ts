/** `ServiceResponseDto` of `GET /api/v1/services` (api-designer-spec §5.1). */
export interface AdminService {
  readonly id: string;
  readonly name: string;
  readonly typeSystem: string;
  readonly typeCode: string;
  readonly typeDisplay?: string;
  readonly defaultDurationMin: number;
  readonly description?: string;
  /** The stored English texts, present when the service has them (the admin list is read in Russian, see `useAdminServices`). */
  readonly nameEn?: string;
  readonly descriptionEn?: string;
  readonly isActive: boolean;
}

/** `CreateServiceDto` / `UpdateServiceDto` body. */
export interface ServicePayload {
  readonly name: string;
  readonly typeSystem: string;
  readonly typeCode: string;
  readonly defaultDurationMin: number;
  readonly description?: string;
  /** English name and description (the HL7 translation extension on the server); a blank one on an edit removes it. */
  readonly nameEn?: string;
  readonly descriptionEn?: string;
  /** `false` deactivates the service: it leaves the public catalogue and the booking wizard (api-designer-spec §5.1.3). */
  readonly isActive?: boolean;
}
