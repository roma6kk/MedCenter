/**
 * Root Jest config for workspace tooling tests (tools/*).
 * Nx projects keep their own per-project configs referenced from project.json.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tools'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.base.json' }],
  },
  testMatch: ['**/*.spec.ts'],
  // The seeds reuse the workspace libs (e.g. `buildConsent`); resolve `@medcenter/*` like tsconfig.base.json does.
  moduleNameMapper: {
    '^@medcenter/([^/]+)$': '<rootDir>/libs/$1/src/index.ts',
  },
};
