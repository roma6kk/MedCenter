import { join } from 'node:path';

import { PROTECTED_ROUTES } from './access-matrix';
import { RouteTracker, loadRouteInventory, parseControllerRoutes, routeKey, templateToPattern } from './route-inventory';

const SOURCE = `
@Controller('api/v1/appointments')
export class AppointmentsController {
  @Post()
  create() {}

  @Get(':id')
  findOne() {}

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel() {}
}`;

describe('parseControllerRoutes', () => {
  it('should join the controller prefix and every handler path', () => {
    expect(parseControllerRoutes(SOURCE, 'appointment-service').map(routeKey)).toEqual([
      'POST /api/v1/appointments',
      'GET /api/v1/appointments/:id',
      'POST /api/v1/appointments/:id/cancel',
    ]);
  });

  it('should leave out routes outside /api/v1 such as /health', () => {
    expect(parseControllerRoutes("@Controller('health') class H { @Get() ok() {} }", 'x')).toEqual([]);
  });

  it('should handle a controller without a prefix and handlers that carry the whole path', () => {
    const source = "@Controller() class C { @Get('api/v1/me') me() {} @Post('oauth/token') t() {} }";

    expect(parseControllerRoutes(source, 'auth-service').map(routeKey)).toEqual(['GET /api/v1/me']);
  });

  it('should return nothing for a file that is not a controller', () => {
    expect(parseControllerRoutes('export const x = 1;', 'x')).toEqual([]);
  });
});

describe('templateToPattern', () => {
  it('should match one path segment for a :param and nothing else', () => {
    const pattern = templateToPattern('/api/v1/appointments/:id/cancel');

    expect(pattern.test('/api/v1/appointments/1453/cancel')).toBe(true);
    expect(pattern.test('/api/v1/appointments/1453/2/cancel')).toBe(false);
    expect(pattern.test('/api/v1/appointments/cancel')).toBe(false);
  });

  it('should take a $expand literally and an encoded canonical as one segment', () => {
    const pattern = templateToPattern('/api/v1/terminology/value-sets/:url/$expand');

    expect(pattern.test('/api/v1/terminology/value-sets/https%3A%2F%2Ffhir.by%2FValueSet%2Fatc/$expand')).toBe(true);
  });
});

describe('RouteTracker', () => {
  const inventory = parseControllerRoutes(SOURCE, 'appointment-service');

  it('should count a route as exercised only after a 2xx answer', () => {
    const tracker = new RouteTracker(inventory);

    tracker.record('POST', '/api/v1/appointments', 401);
    tracker.record('GET', '/api/v1/appointments/7', 404);
    tracker.record('POST', '/api/v1/appointments/7/cancel', 200);

    expect(tracker.uncovered().map(routeKey)).toEqual(['POST /api/v1/appointments', 'GET /api/v1/appointments/:id']);
  });

  it('should ignore the query string and a method the route does not declare', () => {
    const tracker = new RouteTracker(inventory);

    tracker.record('GET', '/api/v1/appointments/7?x=1', 200);
    tracker.record('DELETE', '/api/v1/appointments', 200);

    expect(tracker.uncovered().map(routeKey)).toEqual(['POST /api/v1/appointments', 'POST /api/v1/appointments/:id/cancel']);
  });
});

describe('the real controllers', () => {
  const inventory = loadRouteInventory(join(__dirname, '..', '..', 'apps'));
  const PUBLIC_ROUTES: readonly string[] = [
    'POST /api/v1/auth/register',
    'GET /api/v1/doctors',
    'GET /api/v1/doctors/:id',
    'GET /api/v1/doctors/:id/slots',
    'GET /api/v1/services',
    'GET /api/v1/services/:id',
  ];

  it('should expose routes of all eight services', () => {
    const services = new Set(inventory.map((route) => route.service));

    expect([...services].sort()).toEqual([
      'analytics-service',
      'appointment-service',
      'auth-service',
      'catalog-service',
      'encounter-service',
      'notification-service',
      'patient-service',
      'practitioner-service',
    ]);
  });

  it('should have every non-public route in the access matrix, so no protected route escapes the 401/403 checks', () => {
    const matrix = PROTECTED_ROUTES.map((entry) => ({ method: entry.method, path: entry.path.split('?')[0] ?? entry.path }));
    const missing = inventory
      .filter((route) => !PUBLIC_ROUTES.includes(routeKey(route)))
      .filter((route) => !matrix.some((entry) => entry.method === route.method && templateToPattern(route.path).test(entry.path)))
      .map(routeKey);

    expect(missing).toEqual([]);
  });

  it('should have every access matrix entry backed by a real route', () => {
    const unknown = PROTECTED_ROUTES.filter(
      (entry) => !inventory.some((route) => route.method === entry.method && templateToPattern(route.path).test(entry.path.split('?')[0] ?? entry.path)),
    ).map((entry) => `${entry.method} ${entry.path}`);

    expect(unknown).toEqual([]);
  });
});
