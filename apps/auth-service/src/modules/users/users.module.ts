import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { FhirModule } from '../fhir/fhir.module';
import { IDENTITY_RESOLVER } from '../oauth/identity';
import { AccountController } from './account.controller';
import { ACCOUNT_RETENTION, accountRetentionFromEnv } from './account-retention';
import { AccountFactory } from './account-factory.service';
import { AdminUsersController } from './admin-users.controller';
import { BootstrapAdminService } from './bootstrap-admin.service';
import { CredentialsService } from './credentials.service';
import { PasswordHasher } from './password-hasher';
import { RegistrationOutbox } from './patient-events';
import { PatientProvisioner } from './patient-provisioner';
import { RegistrationService } from './registration.service';
import { UserIdentityResolver } from './user-identity.resolver';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule, FhirModule, AuditModule],
  controllers: [AdminUsersController, AccountController],
  providers: [
    { provide: PasswordHasher, useFactory: (): PasswordHasher => new PasswordHasher() },
    RegistrationOutbox,
    PatientProvisioner,
    AccountFactory,
    RegistrationService,
    { provide: ACCOUNT_RETENTION, useFactory: () => accountRetentionFromEnv() },
    UsersService,
    CredentialsService,
    BootstrapAdminService,
    UserIdentityResolver,
    { provide: IDENTITY_RESOLVER, useExisting: UserIdentityResolver },
  ],
  exports: [CredentialsService, IDENTITY_RESOLVER, UsersService],
})
export class UsersModule {}
