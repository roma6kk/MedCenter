import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, Public } from '@medcenter/common';

export interface HealthResponseDto {
  readonly status: 'ok';
  readonly service: string;
}

/** Swagger projection of `HealthResponseDto`. */
export class HealthResponseDoc implements HealthResponseDto {
  @ApiProperty({ enum: ['ok'] })
  readonly status!: 'ok';

  @ApiProperty({ example: 'patient-service' })
  readonly service!: string;
}

/**
 * Liveness probe for the container runtime (architect §7). Not routed by
 * Traefik (only `/api/v1/**` is), carries no data, hence `@Public()`.
 * `@nestjs/terminus` is not installed, so readiness of HAPI is not probed here.
 */
@ApiTags('patient')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe of patient-service' })
  @ApiResponse({ status: HttpStatus.OK, type: HealthResponseDoc })
  @ApiProblems([500])
  check(): HealthResponseDto {
    return { status: 'ok', service: 'patient-service' };
  }
}
