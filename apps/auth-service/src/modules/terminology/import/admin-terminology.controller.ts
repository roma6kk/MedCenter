import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { RequiresRoles, RequiresScopes } from '@medcenter/common';
import { Role, SMART_SCOPES } from '@medcenter/contracts';

import { actorOf, type AuthenticatedRequest } from '../../users/request-actor';
import { ImportTerminologyDto } from './dto/import-terminology.dto';
import type { ImportAcceptedDto } from './dto/import-response.dto';
import { TerminologyImportService } from './terminology-import.service';

/**
 * API §2.3.4 — runs the snapshot importer (FR-018, ADR-016). ADMIN only, with
 * the SMART `user/*.write` scope on top (API §0 scope matrix): it rewrites the
 * reference data every clinical service validates against.
 */
@Controller('api/v1/admin/terminology')
export class AdminTerminologyController {
  constructor(private readonly imports: TerminologyImportService) {}

  /** `202 Accepted`: the import runs in the background; `409` while another one runs. */
  @Post('import')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_WRITE)
  startImport(@Body() dto: ImportTerminologyDto, @Req() request: AuthenticatedRequest): Promise<ImportAcceptedDto> {
    return this.imports.start(dto.snapshotVersion, actorOf(request));
  }
}
