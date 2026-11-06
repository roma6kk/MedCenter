import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';

runService({ name: 'notification', module: AppModule, dependencies: ['rabbitmq', 'redis'], defaultPort: 3006 });
