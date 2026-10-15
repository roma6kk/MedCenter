import { Module, type Provider } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { FhirModule } from '../fhir/fhir.module';
import { AdminTerminologyController } from './import/admin-terminology.controller';
import { IMPORT_LOCK, createImportLock, type ImportLock } from './import/import-lock';
import { SnapshotImporter } from './import/snapshot-importer';
import { TerminologyImportService } from './import/terminology-import.service';
import { TERMINOLOGY_CACHE, createTerminologyCache, type TerminologyCache } from './terminology-cache';
import { TerminologyController } from './terminology.controller';
import { TerminologyService } from './terminology.service';

const terminologyCacheProvider: Provider = {
  provide: TERMINOLOGY_CACHE,
  useFactory: (): TerminologyCache => createTerminologyCache(),
};

const importLockProvider: Provider = {
  provide: IMPORT_LOCK,
  useFactory: (): ImportLock => createImportLock(),
};

/** Terminology reads (API §2.3.1–2.3.3) and the snapshot import (§2.3.4) over the seeded HAPI ValueSets. */
@Module({
  imports: [FhirModule, AuditModule],
  controllers: [TerminologyController, AdminTerminologyController],
  providers: [terminologyCacheProvider, importLockProvider, TerminologyService, SnapshotImporter, TerminologyImportService],
})
export class TerminologyModule {}
