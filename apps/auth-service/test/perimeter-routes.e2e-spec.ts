import { RequestMethod, type INestApplication, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '@medcenter/common';

import { startAuthApp } from './app-harness';
import { PROTECTED_ENDPOINTS, PUBLIC_ROUTES } from './endpoint-catalog';

jest.mock(
  'jose',
  () => jest.requireActual<typeof import('./synthetic-token')>('./synthetic-token').joseStub,
);

interface RouteInfo {
  readonly key: string;
  readonly isPublic: boolean;
}

const VERBS: Readonly<Record<number, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

function firstPath(metadata: unknown): string {
  const path: unknown = Array.isArray(metadata) ? metadata[0] : metadata;
  return typeof path === 'string' ? path : '';
}

function joinPaths(controllerPath: string, handlerPath: string): string {
  const joined = `/${controllerPath}/${handlerPath}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function routesOf(controller: Type<unknown>): ReadonlyArray<RouteInfo> {
  const controllerPath = firstPath(Reflect.getMetadata(PATH_METADATA, controller));
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype).flatMap((name): ReadonlyArray<RouteInfo> => {
    const handler = prototype[name];
    if (typeof handler !== 'function') {
      return [];
    }
    const verb: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
    if (typeof verb !== 'number') {
      return [];
    }
    const path = joinPaths(controllerPath, firstPath(Reflect.getMetadata(PATH_METADATA, handler)));
    const isPublic =
      Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
      Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
    return [{ key: `${VERBS[verb] ?? String(verb)} ${path}`, isPublic }];
  });
}

/** Every route the real `AppModule` mounts, read from the Nest metadata of its controllers. */
function mountedRoutes(app: INestApplication): ReadonlyArray<RouteInfo> {
  const controllers = [...app.get(ModulesContainer).values()].flatMap((module) =>
    [...module.controllers.values()].flatMap((wrapper) =>
      wrapper.metatype === null ? [] : [wrapper.metatype as Type<unknown>],
    ),
  );
  return controllers.flatMap(routesOf);
}

/**
 * Completeness of the perimeter (ADR-009). `jwt-perimeter.e2e-spec.ts` proves the guard stack
 * protects *a* route; this suite proves no route of the real application escapes the two lists the
 * other suites test: the protected catalogue (`authz-matrix`) and the explicit public allow-list.
 * A new endpoint fails here until it is classified and covered.
 */
describe('Route inventory of the perimeter', () => {
  let app: INestApplication;
  let routes: ReadonlyArray<RouteInfo>;

  beforeAll(async () => {
    app = (await startAuthApp()).app;
    routes = mountedRoutes(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('should find the routes of the application when the controllers are scanned', () => {
    expect(routes.length).toBeGreaterThanOrEqual(PUBLIC_ROUTES.length + PROTECTED_ENDPOINTS.length);
  });

  it('should expose exactly the allow-listed routes without a token when the @Public decorators are read', () => {
    const publicRoutes = routes.filter((route) => route.isPublic).map((route) => route.key);

    expect([...publicRoutes].sort()).toEqual([...PUBLIC_ROUTES].sort());
  });

  it('should guard exactly the routes of the authorization matrix when every other route is read', () => {
    const guarded = routes.filter((route) => !route.isPublic).map((route) => route.key);
    const catalogued = PROTECTED_ENDPOINTS.map(
      (endpoint) => `${endpoint.method.toUpperCase()} ${endpoint.route}`,
    );

    expect([...guarded].sort()).toEqual([...catalogued].sort());
  });

  it('should not declare the same route twice when the controllers are merged', () => {
    const keys = routes.map((route) => route.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
