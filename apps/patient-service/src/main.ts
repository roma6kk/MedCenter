import { runService } from '@medcenter/common';

import { AppModule } from './app/app.module';
import { parsePatientServiceEnv } from './config/patient-service-env';

runService({ name: 'patient', module: AppModule, dependencies: ['hapi'], defaultPort: 3004, parseEnv: parsePatientServiceEnv });
