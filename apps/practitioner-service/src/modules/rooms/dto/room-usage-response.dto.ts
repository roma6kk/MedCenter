export interface RoomUsageReferenceDto {
  readonly resourceType: 'Schedule' | 'PractitionerRole' | 'HealthcareService' | 'Slot';
  readonly id: string;
  readonly display: string;
  readonly isActive?: boolean;
  readonly scheduleId?: string;
  readonly start?: string;
  readonly end?: string;
}

export interface RoomUsageResponseDto {
  readonly roomId: string;
  readonly inUse: boolean;
  readonly truncated: boolean;
  readonly items: readonly RoomUsageReferenceDto[];
}
