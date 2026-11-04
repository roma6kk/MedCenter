import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRouteInventory } from './route-inventory';

const ROOT = join(__dirname, '..', '..');
const SERVICE_PORTS: Readonly<Record<string, number>> = {
  'auth-service': 3001,
  'practitioner-service': 3002,
  'catalog-service': 3003,
  'patient-service': 3004,
  'appointment-service': 3005,
  'notification-service': 3006,
  'encounter-service': 3007,
  'analytics-service': 3008,
};

interface EdgeRouter {
  readonly name: string;
  readonly rule: string;
  readonly priority: number;
  readonly service: string;
}

function section(lines: readonly string[], header: string): string[] {
  const start = lines.findIndex((line) => line === `  ${header}:`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return end === -1 ? rest : rest.slice(0, end);
}

function parseRouters(lines: readonly string[]): EdgeRouter[] {
  const routers: Array<{ name: string; rule: string; priority?: number; service: string }> = [];
  for (const line of section(lines, 'routers')) {
    const name = /^ {4}([\w-]+):\s*$/.exec(line);
    const field = /^ {6}(rule|priority|service):\s*(.+?)\s*$/.exec(line);
    if (name !== null) {
      routers.push({ name: name[1] ?? '', rule: '', service: '' });
    } else if (field !== null && routers.length > 0) {
      const current = routers[routers.length - 1];
      const value = field[2] ?? '';
      if (field[1] === 'rule') current.rule = value;
      else if (field[1] === 'priority') current.priority = Number(value);
      else current.service = value;
    }
  }
  return routers.map((router) => ({ ...router, priority: router.priority ?? router.rule.length }));
}

function parseServicePorts(lines: readonly string[]): Map<string, number> {
  const ports = new Map<string, number>();
  let name = '';
  for (const line of section(lines, 'services')) {
    const header = /^ {4}([\w-]+):\s*$/.exec(line);
    const url = /url:\s*http:\/\/[\w-]+:(\d+)/.exec(line);
    if (header !== null) name = header[1] ?? '';
    else if (url !== null) ports.set(name, Number(url[1]));
  }
  return ports;
}

function matchesAtom(atom: string, method: string, path: string): boolean {
  const parsed = /^(Path|PathPrefix|PathRegexp|Method)\(`(.*)`\)$/.exec(atom.trim());
  const arg = parsed?.[2] ?? '';
  switch (parsed?.[1]) {
    case 'Path': return path === arg;
    case 'PathPrefix': return path.startsWith(arg);
    case 'PathRegexp': return new RegExp(arg).test(path);
    case 'Method': return method === arg;
    default: throw new Error(`Unsupported Traefik rule atom: ${atom}`);
  }
}

function matchesRule(rule: string, method: string, path: string): boolean {
  return rule.split('||').some((alternative) => alternative.split('&&').every((atom) => matchesAtom(atom, method, path)));
}

function winner(routers: readonly EdgeRouter[], method: string, path: string): EdgeRouter | undefined {
  return routers.filter((router) => matchesRule(router.rule, method, path)).sort((a, b) => b.priority - a.priority)[0];
}

describe('Traefik edge routing (infra/traefik/dynamic.yml)', () => {
  const lines = readFileSync(join(ROOT, 'infra', 'traefik', 'dynamic.yml'), 'utf8').split('\n');
  const routers = parseRouters(lines);
  const ports = parseServicePorts(lines);
  const portOf = (router: EdgeRouter | undefined): number | undefined => ports.get(router?.service ?? '');

  it('should route every controller route of every service to its own service', () => {
    const wrong = loadRouteInventory(join(ROOT, 'apps'))
      .map((route) => ({ route, path: route.path.replace(/:\w+/g, 'x') }))
      .filter(({ route, path }) => portOf(winner(routers, route.method, path)) !== SERVICE_PORTS[route.service])
      .map(({ route }) => `${route.method} ${route.path} (${route.service}) -> ${winner(routers, route.method, route.path.replace(/:\w+/g, 'x'))?.name ?? 'no router'}`);

    expect(wrong).toEqual([]);
  });

  it('should know every service port of the header table', () => {
    expect(Object.values(SERVICE_PORTS).every((port) => [...ports.values()].includes(port))).toBe(true);
  });

  it('should publish only GET /fhir/metadata of HAPI', () => {
    expect(winner(routers, 'GET', '/fhir/metadata')?.name).toBe('fhir-metadata');
    expect(winner(routers, 'POST', '/fhir/metadata')).toBeUndefined();
    expect(winner(routers, 'GET', '/fhir/Patient')).toBeUndefined();
  });

  it.each(Object.keys(SERVICE_PORTS))('should expose the Swagger prefix of %s', (service) => {
    const router = winner(routers, 'GET', `/api/docs/${service.replace('-service', '')}`);

    expect(portOf(router)).toBe(SERVICE_PORTS[service]);
  });
});
