import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';

runService({ name: 'practitioner', module: AppModule, dependencies: ['hapi'], defaultPort: 3002 });
