import { generatePassword, randomState, resolvePassword } from './demo-credentials';

/** `PASSWORD_POLICY` of auth-service: length >= 10 with a lower-case letter, an upper-case letter, a digit and a symbol. */
function satisfiesPolicy(password: string): boolean {
  return (
    password.length >= 10 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[-#!$@£%^&*()_+|~=`{}[\]:";'<>?,./\\ ]/.test(password)
  );
}

describe('generatePassword', () => {
  it('should satisfy the auth-service password policy every time', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(satisfiesPolicy(generatePassword())).toBe(true);
    }
  });

  it('should leave out the look-alike characters l, I, O, 0 and 1', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generatePassword()).not.toMatch(/[lIO01]/);
    }
  });

  it('should be 18 characters long and different on each call', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generatePassword()));

    expect(passwords.size).toBe(20);
    expect([...passwords].every((password) => password.length === 18)).toBe(true);
  });

  it('should draw every character from the injected randomness', () => {
    const always = (): number => 0;

    expect(generatePassword(always)).toHaveLength(18);
    expect(generatePassword(always)).toBe(generatePassword(always));
  });
});

describe('randomState', () => {
  it('should be a URL-safe token that is new on each call', () => {
    const first = randomState();

    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomState()).not.toBe(first);
  });
});

describe('resolvePassword', () => {
  const generate = (): string => 'generated';

  it('should prefer the environment over the previous manifest and over generation', () => {
    expect(resolvePassword({ fromEnv: 'env', fromManifest: 'manifest' }, generate)).toBe('env');
  });

  it('should reuse the previous run password when the environment has none', () => {
    expect(resolvePassword({ fromManifest: 'manifest' }, generate)).toBe('manifest');
  });

  it('should generate a password only when nothing else supplies one', () => {
    expect(resolvePassword({}, generate)).toBe('generated');
  });
});
