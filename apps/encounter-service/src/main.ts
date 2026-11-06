import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';

runService({ name: 'encounter', module: AppModule, dependencies: ['hapi'], defaultPort: 3007 });
