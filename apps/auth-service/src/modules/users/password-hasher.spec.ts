import { PasswordHasher } from './password-hasher';

/** Cheap parameters keep the suite fast; production uses `DEFAULT_SCRYPT_PARAMS`. */
const FAST = { N: 2 ** 10, r: 8, p: 1 } as const;

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher(FAST);

  it('should produce a self-describing scrypt string when a password is hashed', async () => {
    const encoded = await hasher.hash('Str0ng!Pass');

    expect(encoded).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('Str0ng!Pass');
  });

  it('should salt every hash so equal passwords never share a stored value', async () => {
    const first = await hasher.hash('Str0ng!Pass');
    const second = await hasher.hash('Str0ng!Pass');

    expect(first).not.toBe(second);
  });

  it('should verify the original password when it is presented again', async () => {
    const encoded = await hasher.hash('Str0ng!Pass');

    await expect(hasher.verify('Str0ng!Pass', encoded)).resolves.toBe(true);
  });

  it('should reject a different password when it is verified', async () => {
    const encoded = await hasher.hash('Str0ng!Pass');

    await expect(hasher.verify('Str0ng!Pasz', encoded)).resolves.toBe(false);
  });

  it('should verify against the parameters stored in the hash when the defaults change', async () => {
    const encoded = await hasher.hash('Str0ng!Pass');
    const stronger = new PasswordHasher({ N: 2 ** 11, r: 8, p: 1 });

    await expect(stronger.verify('Str0ng!Pass', encoded)).resolves.toBe(true);
  });

  it.each([
    ['a foreign scheme', 'bcrypt$10$abc$def'],
    ['a truncated value', 'scrypt$1024$8$1$c2FsdA'],
    ['a cost that is not a power of two', 'scrypt$1000$8$1$c2FsdA$a2V5'],
    ['an oversized cost', `scrypt$${2 ** 21}$8$1$c2FsdA$a2V5`],
    ['an empty string', ''],
  ])('should return false instead of throwing when the stored hash is %s', async (_label, encoded) => {
    await expect(hasher.verify('Str0ng!Pass', encoded)).resolves.toBe(false);
  });

  it('should always answer false when a dummy verification equalises timing', async () => {
    await expect(hasher.verifyAgainstDummy('anything')).resolves.toBe(false);
  });
});
