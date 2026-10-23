import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiProblems, GUARD_PROBLEM_STATUSES, RequiresRoles, RequiresScopes } from '@medcenter/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role, SMART_SCOPES, type PaginatedResponseDto } from '@medcenter/contracts';

import {
  ExpandByCanonicalQueryDto,
  ExpandQueryDto,
  ValidateCodeQueryDto,
  ValueSetUrlParamDto,
} from './dto/terminology-query.dto';
import type {
  ExpansionResponseDto,
  ValidationResponseDto,
  ValueSetSummaryDto,
} from './dto/terminology-response.dto';
import {
  ExpansionResponseDoc,
  ValidationResponseDoc,
  ValueSetPageDoc,
} from './dto/terminology-response.doc';
import { TerminologyService } from './terminology.service';

/** The answer is the same for every caller, but it sits behind a bearer token: only the browser may keep it (`private`). */
const CACHEABLE = 'private, max-age=300';

/**
 * API §2.3.1–2.3.3 — terminology reads (FR-018). The `user/*.read` scope of the
 * spec is enforced by `ScopeGuard`; the ValueSet listing is ADMIN-only.
 * `POST /admin/terminology/import` (2.3.4) lives in `AdminTerminologyController`.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('api/v1/terminology')
export class TerminologyController {
  constructor(private readonly terminology: TerminologyService) {}

  @Get('value-sets')
  @ApiOperation({ summary: '2.3.1 List the seeded ValueSets' })
  @ApiResponse({ status: 200, description: 'A page of ValueSet summaries', type: ValueSetPageDoc })
  @ApiProblems(GUARD_PROBLEM_STATUSES)
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  listValueSets(): Promise<PaginatedResponseDto<ValueSetSummaryDto>> {
    return this.terminology.listValueSets();
  }

  /** API 2.3.2 — `{url}` is the URL-encoded ValueSet canonical. */
  @Get('value-sets/:url/$expand')
  @ApiOperation({ summary: '2.3.2 Expand a ValueSet (URL-encoded canonical in the path)' })
  @ApiResponse({ status: 200, description: 'A page of the expansion (Cache-Control: private, max-age=300)', type: ExpansionResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], { 404: 'NOT_FOUND: the ValueSet is not in the terminology seed' })
  @Header('Cache-Control', CACHEABLE)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  expand(@Param() params: ValueSetUrlParamDto, @Query() query: ExpandQueryDto): Promise<ExpansionResponseDto> {
    return this.terminology.expand(params.url, query);
  }

  /** The same expansion in the form the client calls: `?system=<ValueSet canonical>`. */
  @Get('expand')
  @ApiOperation({ summary: '2.3.2 Expand a ValueSet by canonical (?system=)' })
  @ApiResponse({ status: 200, description: 'A page of the expansion (Cache-Control: private, max-age=300)', type: ExpansionResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400, 404], { 404: 'NOT_FOUND: the ValueSet is not in the terminology seed' })
  @Header('Cache-Control', CACHEABLE)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  expandByCanonical(@Query() query: ExpandByCanonicalQueryDto): Promise<ExpansionResponseDto> {
    return this.terminology.expand(query.system, query);
  }

  @Get('validate')
  @ApiOperation({ summary: '2.3.3 Validate a system and code against the seeded ValueSets' })
  @ApiResponse({ status: 200, description: 'Whether the code is valid in its system', type: ValidationResponseDoc })
  @ApiProblems([...GUARD_PROBLEM_STATUSES, 400])
  @RequiresScopes(SMART_SCOPES.USER_READ)
  validate(@Query() query: ValidateCodeQueryDto): Promise<ValidationResponseDto> {
    return this.terminology.validate(query.system, query.code);
  }
}
