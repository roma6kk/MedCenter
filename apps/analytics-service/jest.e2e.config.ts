export default {
  displayName: 'analytics-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/analytics-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/jest-e2e.setup.ts'],
  // The JWT guard loads `jose` (ESM-only) with a dynamic import; Jest must transform it or every bearer token fails.
  transformIgnorePatterns: ['node_modules/(?!jose/)'],
};
