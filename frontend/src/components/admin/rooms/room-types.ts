export interface AdminRoom {
  readonly id: string;
  readonly identifier: string;
  readonly name: string;
  readonly floor?: number;
  readonly description?: string;
  readonly isActive: boolean;
}

export interface RoomPayload {
  readonly identifier: string;
  readonly name: string;
  readonly floor?: number | null;
  readonly description?: string;
}

interface RoomUsageReference {
  readonly resourceType: 'Schedule' | 'Slot' | 'PractitionerRole' | 'HealthcareService';
  readonly id: string;
  readonly display: string;
  readonly isActive?: boolean;
}

export interface RoomUsage {
  readonly roomId?: string;
  readonly inUse?: boolean;
  readonly truncated?: boolean;
  readonly items: ReadonlyArray<RoomUsageReference>;
}
