import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';

/**
 * Thin persistence wrapper over TypeORM's repository. The login lookup
 * deliberately excludes inactive users so a deactivated account can never
 * Mint new tokens (Task 6/7 rely on this).
 *
 * Note: this class takes a plain TypeORM `Repository` in its constructor
 * instead of `@InjectRepository()` — `@nestjs/typeorm` ships ESM that the
 * Jest/ts-jest pipeline cannot transform, and a thin wrapper gains nothing
 * from the decorator. NestJS wiring (Task 7) provides the repository via a
 * `DataSource`-backed factory provider.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly users: Repository<User>) {}

  create(partial: Partial<User>): User {
    return this.users.create(partial);
  }

  save(user: User): Promise<User> {
    return this.users.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email });
  }

  findByEmailForLogin(email: string): Promise<User | null> {
    return this.users.findOneBy({ email, isActive: true });
  }
}
