import { IsString, Matches, MaxLength } from 'class-validator';

/** API 2.3.4 body. A release number such as `1.4.463`; whether that release is bundled is the service's call (422). */
export class ImportTerminologyDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+(\.\d+){0,3}$/, { message: '$property must be a release number such as 1.4.463' })
  snapshotVersion!: string;
}
