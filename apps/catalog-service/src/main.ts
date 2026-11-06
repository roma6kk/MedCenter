import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';

runService({ name: 'catalog', module: AppModule, dependencies: ['hapi'], defaultPort: 3003 });
