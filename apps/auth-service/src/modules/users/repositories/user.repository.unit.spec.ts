import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { UserRepository } from './user.repository';

function createUsersRepository(overrides: Partial<Repository<User>> = {}): Repository<User> {
  return {
    create: jest.fn().mockImplementation((partial) => Object.assign(new User(), partial)),
    save: jest.fn().mockResolvedValue(undefined),
    findOneBy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Repository<User>;
}

describe('UserRepository (unit)', () => {
  it('should create a user row', async () => {
    const users = createUsersRepository() as unknown as Repository<User>;
    const repository = new UserRepository(users);

    const user = repository.create({
      email: 'ivanov@example.by',
      passwordHash: 'x',
      firstName: 'Иван',
      lastName: 'Иванов',
    });

    expect(user.email).toBe('ivanov@example.by');
    expect(user.passwordHash).toBe('x');
    expect(users.create).toHaveBeenCalledTimes(1);
  });

  it('should save a user', async () => {
    const users = createUsersRepository() as unknown as Repository<User>;
    const repository = new UserRepository(users);
    const user = new User();

    await repository.save(user);

    expect(users.save).toHaveBeenCalledWith(user);
  });

  it('should find a user by email', async () => {
    const users = createUsersRepository() as unknown as Repository<User>;
    const repository = new UserRepository(users);
    const expected: User | null = null;
    (users.findOneBy as jest.Mock).mockResolvedValue(expected);

    const found = await repository.findByEmail('ivanov@example.by');

    expect(found).toBeNull();
    expect(users.findOneBy).toHaveBeenCalledWith({ email: 'ivanov@example.by' });
  });

  it('should find an active user by email', async () => {
    const users = createUsersRepository() as unknown as Repository<User>;
    const repository = new UserRepository(users);
    const expected: User | null = null;
    (users.findOneBy as jest.Mock).mockResolvedValue(expected);

    const found = await repository.findByEmailForLogin('ivanov@example.by');

    expect(found).toBeNull();
    expect(users.findOneBy).toHaveBeenCalledWith({
      email: 'ivanov@example.by',
      isActive: true,
    });
  });

  it('should exclude inactive users from the login lookup', async () => {
    const users = createUsersRepository() as unknown as Repository<User>;
    const repository = new UserRepository(users);
    const active: User | null = null;
    (users.findOneBy as jest.Mock).mockResolvedValue(active);

    const found = await repository.findByEmailForLogin('off@example.by');

    expect(found).toBeNull();
  });
});
