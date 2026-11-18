import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiProblems, Public } from '@medcenter/common';

class HealthStatus {
  @ApiProperty({ example: 'encounter-service' })
  readonly service!: string;

  @ApiProperty({ enum: ['ok'] })
  readonly status!: 'ok';
}

@ApiTags('encounter')
@Controller()
export class HealthController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'The process serves HTTP', type: HealthStatus })
  @ApiProblems([500])
  check(): HealthStatus {
    return { service: 'encounter-service', status: 'ok' };
  }
}
