export interface ServiceResponseDto {
  readonly id: string;
  readonly name: string;
  readonly typeSystem: string;
  readonly typeCode: string;
  readonly typeDisplay: string;
  readonly defaultDurationMin: number;
  readonly description?: string;
  readonly nameEn?: string;
  readonly descriptionEn?: string;
  readonly isActive: boolean;
}
