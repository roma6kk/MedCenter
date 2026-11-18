export default {
  displayName: 'encounter-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/encounter-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transformIgnorePatterns: ['node_modules/(?!jose/)'],
};
