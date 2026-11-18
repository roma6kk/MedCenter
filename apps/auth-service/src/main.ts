import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';

runService({ name: 'auth', module: AppModule, dependencies: ['postgres', 'redis'], defaultPort: 3001 });
