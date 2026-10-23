import { Module } from '@nestjs/common';

import { HealthModule } from '../modules/health/health.module';
import { RelayModule } from '../modules/relay/relay.module';

@Module({ imports: [RelayModule, HealthModule] })
export class AppModule {}
