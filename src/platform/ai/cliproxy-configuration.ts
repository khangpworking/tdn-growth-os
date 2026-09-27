/** CLIProxy connection settings (brief P2, tightened to numeric loopback only). Pure parsing; no I/O. */

export interface CliproxyConfiguration { readonly baseUrl: string; readonly apiKey: string }

// Checked on the raw string: WHATWG URL parsing normalizes `127.1`, `0x7f.0.0.1` and drops `:80`.
const BASE_URL = /^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/?$/;
const API_KEY = /^[\x21-\x7e]{1,512}$/;

export function cliproxyConfigurationFromEnvironment(environment: NodeJS.ProcessEnv): CliproxyConfiguration | undefined {
  const rawBaseUrl = environment.TDN_CLIPROXY_BASE_URL;
  const apiKey = environment.TDN_CLIPROXY_API_KEY;
  if (rawBaseUrl === undefined && apiKey === undefined) return undefined;
  if (rawBaseUrl === undefined || apiKey === undefined) {
    throw new TypeError('TDN_CLIPROXY_BASE_URL and TDN_CLIPROXY_API_KEY must be set together');
  }
  const match = BASE_URL.exec(rawBaseUrl);
  if (!match || Number(match[2]) > 65535) {
    throw new TypeError('TDN_CLIPROXY_BASE_URL must be http://127.0.0.1:<port> or http://[::1]:<port> (port 1-65535, no path, query or credentials)');
  }
  const configuration: CliproxyConfiguration = Object.freeze({ baseUrl: `http://${match[1]}:${match[2]}`, apiKey });
  assertCliproxyConfiguration(configuration);
  return configuration;
}

/** Re-checks an already parsed configuration (normalized base URL, key shape). Never echoes either value. */
export function assertCliproxyConfiguration(configuration: CliproxyConfiguration): void {
  const match = typeof configuration.baseUrl === 'string' ? BASE_URL.exec(configuration.baseUrl) : null;
  if (!match || configuration.baseUrl.endsWith('/') || Number(match[2]) > 65535) {
    throw new TypeError('CLIProxy base URL must be http://127.0.0.1:<port> or http://[::1]:<port> without a trailing slash');
  }
  if (typeof configuration.apiKey !== 'string' || !API_KEY.test(configuration.apiKey)) {
    throw new TypeError('TDN_CLIPROXY_API_KEY must be 1-512 printable ASCII characters without spaces');
  }
}
