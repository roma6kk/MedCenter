/** API §5.1 `ServiceResponseDto`. */
export interface ServiceResponseDto {
  readonly id: string;
  /** Localized by `Accept-Language`: the English text when asked for and stored, else the Russian one. */
  readonly name: string;
  readonly typeSystem: string;
  readonly typeCode: string;
  readonly typeDisplay: string;
  readonly defaultDurationMin: number;
  /** Localized like {@link name}. */
  readonly description?: string;
  /** The stored English name (admin editing); absent when there is none, whatever the request language. */
  readonly nameEn?: string;
  /** The stored English description (admin editing); absent when there is none. */
  readonly descriptionEn?: string;
  readonly isActive: boolean;
}
