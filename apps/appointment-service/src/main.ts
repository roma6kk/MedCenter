import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';

runService({ name: 'appointment', module: AppModule, dependencies: ['hapi'], defaultPort: 3005 });
