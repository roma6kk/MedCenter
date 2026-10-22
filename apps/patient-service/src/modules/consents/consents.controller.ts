import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  claimsOf,
  RequiresRoles,
  type RequestWithClaims,
  type RequestWithRequestId,
} from '@medcenter/common';
import {
  Role,
  type ConsentResponse,
  type ConsentScanUploadResponse,
  type PatientConsentResponse,
} from '@medcenter/contracts';

import { PatientIdParamsDto } from '../patients/dto/patient-id-params.dto';
import type { UploadedScan } from './consent-scan';
import { ConsentsService } from './consents.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { RevokeConsentDto } from './dto/revoke-consent.dto';
import { ScanParamsDto } from './dto/scan-params.dto';
import { ScanUploadInterceptor } from './scan-upload.interceptor';

type AuditedRequest = RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>;

/**
 * API §3.7–3.11 — a patient's consent to the electronic record, managed by a
 * DOCTOR (only a patient they share care with, ADR-013) or an ADMIN. The scope
 * and the compartment are enforced in `PatientAccessService`, because
 * `@RequiresScopes` cannot tell a read from a write per route.
 */
@Controller('api/v1/patients')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get(':id/consent')
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  async get(
    @Req() request: AuditedRequest,
    @Param() params: PatientIdParamsDto,
  ): Promise<PatientConsentResponse> {
    return this.consents.getForPatient(params.id, claimsOf(request), request.requestId);
  }

  @Post(':id/consent')
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  async create(
    @Req() request: AuditedRequest,
    @Param() params: PatientIdParamsDto,
    @Body() dto: CreateConsentDto,
  ): Promise<ConsentResponse> {
    return this.consents.create(params.id, dto, claimsOf(request), request.requestId);
  }

  @Post(':id/consent/revoke')
  @HttpCode(HttpStatus.OK)
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  async revoke(
    @Req() request: AuditedRequest,
    @Param() params: PatientIdParamsDto,
    @Body() dto: RevokeConsentDto,
  ): Promise<ConsentResponse> {
    return this.consents.revoke(params.id, dto, claimsOf(request), request.requestId);
  }

  @Post(':id/consent/scan')
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  @UseInterceptors(ScanUploadInterceptor)
  async uploadScan(
    @Req() request: AuditedRequest,
    @Param() params: PatientIdParamsDto,
    @UploadedFile() file: UploadedScan | undefined,
  ): Promise<ConsentScanUploadResponse> {
    return this.consents.uploadScan(params.id, file, claimsOf(request), request.requestId);
  }

  /** The scan is a personal document: never cached, never sniffed, always a download. */
  @Get(':id/consent/scan/:scanId')
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Disposition', 'attachment; filename="consent-scan"')
  async readScan(
    @Req() request: AuditedRequest,
    @Param() params: ScanParamsDto,
  ): Promise<StreamableFile> {
    const scan = await this.consents.readScan(
      params.id,
      params.scanId,
      claimsOf(request),
      request.requestId,
    );
    return new StreamableFile(scan.data, { type: scan.contentType });
  }
}
