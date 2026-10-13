export default {
  displayName: 'appointment-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/appointment-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  // The JWT guard loads `jose` (ESM-only) with a dynamic import; Jest must transform it or every bearer token fails.
  transformIgnorePatterns: ['node_modules/(?!jose/)'],
};
