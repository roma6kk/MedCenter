import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';

runService({ name: 'analytics', module: AppModule, dependencies: ['postgres'], defaultPort: 3008 });
