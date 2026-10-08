export default {
  displayName: 'catalog-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/catalog-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
};
