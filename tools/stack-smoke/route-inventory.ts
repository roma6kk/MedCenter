import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

interface RouteTemplate {
  readonly service: string;
  readonly method: string;
  readonly path: string;
}

const API_PREFIX = '/api/v1';
const CONTROLLER = /@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/;
const HANDLER = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;

function joinPath(prefix: string, path: string): string {
  const parts = [prefix, path].map((part) => part.replace(/^\/+|\/+$/g, '')).filter((part) => part.length > 0);
  return `/${parts.join('/')}`;
}

export function parseControllerRoutes(source: string, service: string): RouteTemplate[] {
  const controller = CONTROLLER.exec(source);
  if (controller === null) {
    return [];
  }
  const prefix = controller[1] ?? controller[2] ?? '';
  return [...source.matchAll(HANDLER)]
    .map((handler) => ({ service, method: (handler[1] ?? '').toUpperCase(), path: joinPath(prefix, handler[2] ?? handler[3] ?? '') }))
    .filter((route) => route.path.startsWith(`${API_PREFIX}/`));
}

function controllerFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return controllerFiles(path);
    }
    return entry.endsWith('.controller.ts') ? [path] : [];
  });
}

export function loadRouteInventory(appsDirectory: string): RouteTemplate[] {
  return readdirSync(appsDirectory).flatMap((service) =>
    controllerFiles(join(appsDirectory, service, 'src')).flatMap((file) => parseControllerRoutes(readFileSync(file, 'utf8'), service)),
  );
}

export function templateToPattern(template: string): RegExp {
  const source = template
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${source}$`);
}

export function routeKey(route: Pick<RouteTemplate, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}

export const UNREACHABLE_ROUTES: Readonly<Record<string, string>> = {
  'POST /api/v1/doctor/appointments/:id/noshow': 'a no-show is recorded only once the visit has started',
};

export class RouteTracker {
  private readonly patterns: ReadonlyArray<{ readonly route: RouteTemplate; readonly pattern: RegExp }>;
  private readonly exercised = new Set<string>();

  constructor(inventory: readonly RouteTemplate[]) {
    this.patterns = inventory.map((route) => ({ route, pattern: templateToPattern(route.path) }));
  }

  record(method: string, path: string, status: number): void {
    if (status < 200 || status >= 300) {
      return;
    }
    const pathname = path.split('?')[0] ?? path;
    for (const { route, pattern } of this.patterns) {
      if (route.method === method && pattern.test(pathname)) {
        this.exercised.add(routeKey(route));
      }
    }
  }

  uncovered(): RouteTemplate[] {
    return this.patterns
      .map(({ route }) => route)
      .filter((route) => !this.exercised.has(routeKey(route)) && !(routeKey(route) in UNREACHABLE_ROUTES));
  }

  get total(): number {
    return this.patterns.length;
  }
}
