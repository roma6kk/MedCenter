// The first request of a suite loads `jose` and fetches the JWKS; on a loaded
// host that alone can exceed Jest's 5 s default, which failed whole suites.
jest.setTimeout(30_000);
