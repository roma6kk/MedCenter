export default {
  displayName: 'notification-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/notification-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  // The JWT guard loads `jose` (ESM-only) with a dynamic import; Jest must transform it when a suite verifies real signatures.
  transformIgnorePatterns: ['node_modules/(?!jose/)'],
};
