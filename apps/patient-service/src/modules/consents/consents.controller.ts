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
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiProblems,
  claimsOf,
  GUARD_PROBLEM_STATUSES,
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
import {
  ConsentResponseDoc,
  ConsentScanUploadBodyDoc,
  ConsentScanUploadResponseDoc,
  PatientConsentResponseDoc,
} from './dto/consent-response.doc';
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
@ApiTags('patient')
@ApiBearerAuth()
@Controller('api/v1/patients')
export class ConsentsController {
  constructor(private readonly consents: ConsentsService) {}

  @Get(':id/consent')
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: '3.7 Get the consent status and history of a patient' })
  @ApiResponse({ status: HttpStatus.OK, type: PatientConsentResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], {
    403: 'FORBIDDEN_SCOPE | FORBIDDEN_ROLE | COMPARTMENT_VIOLATION: doctor without a shared care link',
  })
  async get(
    @Req() request: AuditedRequest,
    @Param() params: PatientIdParamsDto,
  ): Promise<PatientConsentResponse> {
    return this.consents.getForPatient(params.id, claimsOf(request), request.requestId);
  }

  @Post(':id/consent')
  @RequiresRoles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({ summary: '3.8 Enter a paper consent or a written refusal' })
  @ApiResponse({ status: HttpStatus.CREATED, type: ConsentResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    400: 'VALIDATION_ERROR: invalid body, unknown or foreign scanId, relatedPersonId of another patient',
    403: 'FORBIDDEN_SCOPE | FORBIDDEN_ROLE | COMPARTMENT_VIOLATION: doctor without a shared care link',
    409: 'CONSENT_ALREADY_ACTIVE: an active consent exists, revoke it first',
  })
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
  @ApiOperation({ summary: '3.9 Record a written revocation of the consent' })
  @ApiResponse({ status: HttpStatus.OK, type: ConsentResponseDoc, description: 'Consent with status inactive' })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404, 409], {
    403: 'FORBIDDEN_SCOPE | FORBIDDEN_ROLE | COMPARTMENT_VIOLATION: doctor without a shared care link',
    404: 'NOT_FOUND: no active consent to revoke',
    409: 'CONFLICT: the consent was changed concurrently',
  })
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
  @ApiOperation({ summary: '3.10 Upload the scan of the consent form' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ConsentScanUploadBodyDoc })
  @ApiResponse({ status: HttpStatus.CREATED, type: ConsentScanUploadResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], {
    400: 'VALIDATION_ERROR: no file, over 10 MB, or not PDF/JPEG/PNG by signature',
    403: 'FORBIDDEN_SCOPE | FORBIDDEN_ROLE | COMPARTMENT_VIOLATION: doctor without a shared care link',
  })
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
  @ApiOperation({ summary: '3.11 Download the scan of the consent form (every read is audited)' })
  @ApiProduces('application/pdf', 'image/jpeg', 'image/png')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Scan bytes with the stored Content-Type',
    content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], {
    403: 'FORBIDDEN_SCOPE | FORBIDDEN_ROLE | COMPARTMENT_VIOLATION: doctor without a shared care link',
    404: 'NOT_FOUND: unknown scan or a scan of another patient',
  })
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
