import { Role } from '@medcenter/contracts';
import { ApiProperty } from '@nestjs/swagger';

import { PageMetaDoc } from './page-meta.doc';
import type { ExternalLinkDto, UserDetailsResponseDto, UserResponseDto } from './user-response.dto';

/** OpenAPI description of `UserResponseDto` (an interface cannot be reflected by Swagger). */
export class UserResponseDoc implements UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ivanov@example.by' })
  email!: string;

  @ApiProperty({ example: 'Иван' })
  firstName!: string;

  @ApiProperty({ example: 'Иванов' })
  lastName!: string;

  @ApiProperty({ enum: Role, enumName: 'Role', isArray: true })
  roles!: Role[];

  @ApiProperty({ type: String, nullable: true, example: 'Patient/9f2c', description: 'Patient/{id} or null' })
  patientRef!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'PractitionerRole/pr-1', description: 'PractitionerRole/{id} (DOCTOR link) or null' })
  practitionerRoleRef!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ example: 'Иванов Иван', description: 'Display name, last name first' })
  name!: string;

  @ApiProperty({ enum: Role, enumName: 'Role', nullable: true, description: 'The role a token of this account carries (ADMIN > DOCTOR > PATIENT)' })
  role!: Role | null;
}

export class ExternalLinkDoc implements ExternalLinkDto {
  @ApiProperty({ enum: ['Patient', 'PractitionerRole'] })
  resourceType!: 'Patient' | 'PractitionerRole';

  @ApiProperty({ example: '9f2c' })
  resourceId!: string;

  @ApiProperty({ example: 'Patient/9f2c', description: 'Relative FHIR reference' })
  reference!: string;
}

/** The user plus its `ExternalLink` rows (API 2.2.3, 2.2.7). */
export class UserDetailsResponseDoc extends UserResponseDoc implements UserDetailsResponseDto {
  @ApiProperty({ type: [ExternalLinkDoc] })
  externalLinks!: ExternalLinkDoc[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** Page of users (API 2.2.2). */
export class UserPageDoc {
  @ApiProperty({ type: [UserResponseDoc] })
  items!: UserResponseDoc[];

  @ApiProperty({ type: PageMetaDoc })
  meta!: PageMetaDoc;
}
