import { Module } from '@nestjs/common';
import { createEventPublisherProvider } from '@medcenter/messaging';

import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { FhirModule } from '../fhir/fhir.module';
import { IDENTITY_RESOLVER } from '../oauth/identity';
import { AccountController } from './account.controller';
import { AccountFactory } from './account-factory.service';
import { AdminUsersController } from './admin-users.controller';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { CredentialsService } from './credentials.service';
import { PasswordHasher } from './password-hasher';
import { PatientEventsPublisher } from './patient-events.publisher';
import { PatientProvisioner } from './patient-provisioner';
import { RegistrationService } from './registration.service';
import { UserIdentityResolver } from './user-identity.resolver';
import { UsersService } from './users.service';

/**
 * Accounts of the `auth` schema (API §2.2) and the two answers the OAuth
 * surface needs from them: "are these credentials valid?"
 * (`CredentialsService`) and "who is this token for?" (`IDENTITY_RESOLVER`).
 */
@Module({
  imports: [DatabaseModule, FhirModule, AuditModule],
  controllers: [AdminUsersController, AccountController],
  providers: [
    // Built by a factory: the scrypt parameters are a plain object, not a DI token.
    { provide: PasswordHasher, useFactory: (): PasswordHasher => new PasswordHasher() },
    createEventPublisherProvider(),
    PatientEventsPublisher,
    PatientProvisioner,
    AccountFactory,
    RegistrationService,
    UsersService,
    CredentialsService,
    BootstrapAdminService,
    UserIdentityResolver,
    { provide: IDENTITY_RESOLVER, useExisting: UserIdentityResolver },
  ],
  exports: [CredentialsService, IDENTITY_RESOLVER],
})
export class UsersModule {}
