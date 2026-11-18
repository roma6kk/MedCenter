export default {
  displayName: 'catalog-service-e2e',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/catalog-service',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  // `jose` is ESM-only: Jest must transform it when a suite verifies real JWT signatures.
  transformIgnorePatterns: ['node_modules/(?!jose/)'],
};
