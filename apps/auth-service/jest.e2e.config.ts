export default {
  displayName: 'auth-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/auth-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
};
