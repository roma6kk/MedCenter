import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.spec.tsx'],
  // The 5 s default is too tight for a user-event spec on a busy machine (parallel workers): it passed on a retry.
  // A real hang still fails within seconds; the heaviest doctor specs raise it to 30 s themselves.
  testTimeout: 15_000,
};

export default createJestConfig(config);
