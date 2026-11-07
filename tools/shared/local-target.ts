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

// Remote hosts are refused unless allowed: a stray env URL must not leave privileged accounts or test data on a shared stand.
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
