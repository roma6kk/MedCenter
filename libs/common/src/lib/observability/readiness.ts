import { connect } from 'node:net';

/** One dependency a service cannot serve without. `run` rejects when it is unreachable. */
export interface ReadinessCheck {
  readonly name: string;
  readonly run: (signal: AbortSignal) => Promise<void>;
}

export interface ReadinessReport {
  readonly ok: boolean;
  /** Names of the failed dependencies only: no hosts, no error text (OWASP A05). */
  readonly failed: readonly string[];
}

export const READINESS_TIMEOUT_MS = 2000;

/** Runs every check in parallel, each with its own timeout; one slow dependency cannot hide another. */
export async function runReadiness(
  checks: readonly ReadinessCheck[],
  timeoutMs: number = READINESS_TIMEOUT_MS,
): Promise<ReadinessReport> {
  const results = await Promise.all(
    checks.map(async (check) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        await Promise.race([
          check.run(controller.signal),
          new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
          }),
        ]);
        return null;
      } catch {
        return check.name;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  const failed = results.filter((name): name is string => name !== null);
  return { ok: failed.length === 0, failed };
}

/** The dependencies a service can declare; each is probed only when its environment is configured. */
export type ReadinessDependency = 'hapi' | 'redis' | 'rabbitmq' | 'postgres';

function tcpCheck(name: string, host: string, port: number): ReadinessCheck {
  return {
    name,
    run: (signal) =>
      new Promise<void>((resolve, reject) => {
        const socket = connect({ host, port });
        const done = (error?: Error): void => {
          socket.destroy();
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        };
        socket.once('connect', () => done());
        socket.once('error', (error) => done(error));
        signal.addEventListener('abort', () => done(new Error('timeout')), { once: true });
      }),
  };
}

function urlTcpCheck(name: string, raw: string | undefined, defaultPort: number): ReadinessCheck | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }
  try {
    const url = new URL(raw);
    return tcpCheck(name, url.hostname.replace(/^\[|\]$/g, ''), url.port === '' ? defaultPort : Number(url.port));
  } catch {
    // An unparsable URL is a boot-time concern of the service's own env schema, not a reason to be unready here.
    return null;
  }
}

/**
 * Checks for the declared dependencies, read from the same variables the
 * service itself uses: HAPI answers `GET {FHIR_BASE_URL}/metadata`, Redis,
 * RabbitMQ and PostgreSQL accept a TCP connection. A dependency whose variable
 * is unset is skipped (unit and e2e runs have none).
 */
export function readinessChecksFromEnv(
  dependencies: readonly ReadinessDependency[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  for (const dependency of dependencies) {
    let check: ReadinessCheck | null = null;
    if (dependency === 'hapi') {
      const base = env['FHIR_BASE_URL']?.trim();
      if (base) {
        check = {
          name: 'hapi',
          run: async (signal) => {
            const response = await fetchImpl(`${base.replace(/\/+$/, '')}/metadata?_summary=true`, {
              signal,
              headers: { accept: 'application/fhir+json' },
            });
            if (!response.ok) {
              throw new Error(`HAPI answered ${response.status}`);
            }
          },
        };
      }
    } else if (dependency === 'redis') {
      check = urlTcpCheck('redis', env['REDIS_URL'], 6379);
    } else if (dependency === 'rabbitmq') {
      check = urlTcpCheck('rabbitmq', env['RABBITMQ_URL'], 5672);
    } else {
      const host = (env['AUTH_DB_HOST'] ?? env['DB_HOST'])?.trim();
      if (host) {
        const port = Number(env['AUTH_DB_PORT'] ?? env['DB_PORT'] ?? env['POSTGRES_PORT'] ?? 5432);
        check = tcpCheck('postgres', host, Number.isInteger(port) && port > 0 ? port : 5432);
      }
    }
    if (check !== null) {
      checks.push(check);
    }
  }
  return checks;
}
