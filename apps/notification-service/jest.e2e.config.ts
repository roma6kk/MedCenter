export default {
  displayName: 'notification-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/notification-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  // jose is ESM-only: Jest must transform it when a suite verifies real signatures.
  transformIgnorePatterns: ['node_modules/(?!jose/)'],
};
