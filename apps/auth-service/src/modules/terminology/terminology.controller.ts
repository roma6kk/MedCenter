import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { RequiresRoles, RequiresScopes } from '@medcenter/common';
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
import { TerminologyService } from './terminology.service';

/** The answer is the same for every caller, but it sits behind a bearer token: only the browser may keep it (`private`). */
const CACHEABLE = 'private, max-age=300';

/**
 * API §2.3.1–2.3.3 — terminology reads (FR-018). The `user/*.read` scope of the
 * spec is enforced by `ScopeGuard`; the ValueSet listing is ADMIN-only.
 * `POST /admin/terminology/import` (2.3.4) lives in `AdminTerminologyController`.
 */
@Controller('api/v1/terminology')
export class TerminologyController {
  constructor(private readonly terminology: TerminologyService) {}

  @Get('value-sets')
  @RequiresRoles(Role.ADMIN)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  listValueSets(): Promise<PaginatedResponseDto<ValueSetSummaryDto>> {
    return this.terminology.listValueSets();
  }

  /** API 2.3.2 — `{url}` is the URL-encoded ValueSet canonical. */
  @Get('value-sets/:url/$expand')
  @Header('Cache-Control', CACHEABLE)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  expand(@Param() params: ValueSetUrlParamDto, @Query() query: ExpandQueryDto): Promise<ExpansionResponseDto> {
    return this.terminology.expand(params.url, query);
  }

  /** The same expansion in the form the client calls: `?system=<ValueSet canonical>`. */
  @Get('expand')
  @Header('Cache-Control', CACHEABLE)
  @RequiresScopes(SMART_SCOPES.USER_READ)
  expandByCanonical(@Query() query: ExpandByCanonicalQueryDto): Promise<ExpansionResponseDto> {
    return this.terminology.expand(query.system, query);
  }

  @Get('validate')
  @RequiresScopes(SMART_SCOPES.USER_READ)
  validate(@Query() query: ValidateCodeQueryDto): Promise<ValidationResponseDto> {
    return this.terminology.validate(query.system, query.code);
  }
}
