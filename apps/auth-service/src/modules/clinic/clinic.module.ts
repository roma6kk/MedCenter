import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { AuditModule } from '../audit/audit.module';
import { AdminClinicController } from './admin-clinic.controller';
import { ClinicController } from './clinic.controller';
import { ClinicService } from './clinic.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [ClinicController, AdminClinicController],
  providers: [ClinicService],
})
export class ClinicModule {}
