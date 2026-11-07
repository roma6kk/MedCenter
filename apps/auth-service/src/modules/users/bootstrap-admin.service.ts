import { ConflictException, Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Role } from '@medcenter/contracts';

import { parseBootstrapAdminEnv, type BootstrapAdminEnv } from '../../config/auth-env';
import { SYSTEM_ACTOR } from '../audit/audit-event.builder';
import { AccountFactory } from './account-factory.service';
import { USER_STORE, type UserStore } from './store/user-store';

@Injectable()
export class BootstrapAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapAdminService.name);

  constructor(
    private readonly accounts: AccountFactory,
    @Inject(USER_STORE) private readonly store: UserStore,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const admin = parseBootstrapAdminEnv(process.env);
    if (admin !== null) {
      await this.ensureAdmin(admin);
    }
  }

  async ensureAdmin(admin: BootstrapAdminEnv): Promise<void> {
    if ((await this.store.findByEmail(admin.email)) !== null) {
      this.logger.log('Bootstrap administrator already exists; nothing to do');
      return;
    }
    try {
      await this.accounts.create(
        { email: admin.email, password: admin.password, firstName: admin.firstName, lastName: admin.lastName, roles: [Role.ADMIN] },
        { event: 'user.bootstrapped', actor: { sub: SYSTEM_ACTOR } },
      );
      this.logger.log('Bootstrap administrator created');
    } catch (error: unknown) {
      // another replica won the unique email index
      if (error instanceof ConflictException) {
        this.logger.log('Bootstrap administrator was created concurrently; nothing to do');
        return;
      }
      throw error;
    }
  }
}
