/** Hosts a developer stack lives on: loopback and the reserved development names (`*.localhost`, `*.test`). */
const LOOPBACK_V4 = /^127(?:\.\d{1,3}){3}$/;
const LOCAL_SUFFIXES: readonly string[] = ['.localhost', '.test'];

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || LOOPBACK_V4.test(host) || LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function hostnameOf(variable: string, rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    throw new Error(`${variable} is not a valid URL`);
  }
}

/**
 * The seed and smoke tools create accounts, write reference data and delete test data. They aim at the local
 * compose stack, so another host is refused unless `allowVariable` is `true` in the environment: a stray
 * `SEED_AUTH_BASE_URL` or `SMOKE_BASE_URL` must not leave a privileged account or test users on a shared stand.
 * The message names the host, never the full URL.
 */
export function assertLocalTarget(variable: string, rawUrl: string, allowVariable: string, env: NodeJS.ProcessEnv = process.env): void {
  const hostname = hostnameOf(variable, rawUrl);
  if (isLocalHost(hostname)) {
    return;
  }
  if (env[allowVariable]?.trim() !== 'true') {
    throw new Error(
      `${variable} points at ${hostname}, which is not a local host: this tool creates accounts and test data. ` +
        `Set ${allowVariable}=true to run it against that host on purpose.`,
    );
  }
  console.warn(`${allowVariable}=true: running against the non-local host ${hostname}`);
}
