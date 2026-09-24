import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { openContentOwnerApi, openContentReadApi, type ContentApiApplication } from './content-api.js';
import { openOwnerApi, type OwnerApiApplication } from './owner-api.js';
import { openWorkspaceApi, type WorkspaceApiApplication } from './workspace-api.js';

const TOKEN = /^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7e]{32,512}$/;
const ACTOR = /^[a-z][a-z0-9:_-]{2,119}$/;
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

type StaticFile = Readonly<{ bytes: Buffer; mime: string }>;
type StaticFiles = ReadonlyMap<string, StaticFile>;

export interface OperatorAppConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
  readonly frontendDist: string;
  readonly version: string;
  readonly host: '127.0.0.1' | '::1';
  readonly port: number;
  readonly ownerWritesEnabled: boolean;
  readonly ownerToken?: string;
  readonly ownerActorId?: string;
}
export interface OperatorAppApplication {
  readonly server: http.Server;
  readonly origin: string;
  close(): Promise<void>;
}

export function operatorAppConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv,
  defaults: { readonly frontendDist: string; readonly version: string },
): OperatorAppConfiguration {
  const enabled = environment.TDN_OWNER_API_ENABLED;
  if (enabled !== undefined && enabled !== 'true' && enabled !== 'false') throw new TypeError('TDN_OWNER_API_ENABLED must be exactly true or false');
  const rawPort = environment.TDN_OPERATOR_APP_PORT ?? '8787';
  if (!/^[1-9]\d{0,4}$/.test(rawPort)) throw new TypeError('TDN_OPERATOR_APP_PORT must be an integer from 1 to 65535');
  const configuration: OperatorAppConfiguration = {
    databasePath: environment.TDN_WORKSPACE_DB ?? '', artifactRoot: environment.TDN_ARTIFACT_ROOT ?? '',
    frontendDist: defaults.frontendDist, version: defaults.version,
    host: (environment.TDN_OPERATOR_APP_HOST ?? '127.0.0.1') as '127.0.0.1' | '::1',
    port: Number(rawPort), ownerWritesEnabled: enabled === 'true',
    ...(environment.TDN_OWNER_API_TOKEN === undefined ? {} : { ownerToken: environment.TDN_OWNER_API_TOKEN }),
    ...(environment.TDN_OWNER_API_ACTOR_ID === undefined ? {} : { ownerActorId: environment.TDN_OWNER_API_ACTOR_ID }),
  };
  validateConfiguration(configuration);
  return configuration;
}

export function openOperatorApp(configuration: OperatorAppConfiguration): OperatorAppApplication {
  const frontend = validateConfiguration(configuration);
  const origin = operatorOrigin(configuration.host, configuration.port);
  const authority = origin.slice('http://'.length);
  let read: WorkspaceApiApplication | undefined;
  let owner: OwnerApiApplication | undefined;
  let contentRead: ContentApiApplication | undefined;
  let contentOwner: ContentApiApplication | undefined;
  try {
    read = openWorkspaceApi({ databasePath: configuration.databasePath, artifactRoot: configuration.artifactRoot });
    contentRead = openContentReadApi({ databasePath: configuration.databasePath, artifactRoot: configuration.artifactRoot });
    if (configuration.ownerWritesEnabled) owner = openOwnerApi({
      databasePath: configuration.databasePath, artifactRoot: configuration.artifactRoot, writeEnabled: true,
      token: configuration.ownerToken!, actorId: configuration.ownerActorId!, allowedOrigin: origin,
    });
    if (configuration.ownerWritesEnabled) contentOwner = openContentOwnerApi({
      databasePath: configuration.databasePath, artifactRoot: configuration.artifactRoot, writeEnabled: true,
      token: configuration.ownerToken!, actorId: configuration.ownerActorId!, allowedOrigin: origin,
    });
  } catch (error) {
    try { contentOwner?.close(); } catch { /* preserve startup failure */ }
    try { contentRead?.close(); } catch { /* preserve startup failure */ }
    try { owner?.close(); } catch { /* preserve startup failure */ }
    try { read?.close(); } catch { /* preserve startup failure */ }
    throw error;
  }
  const readApplication = read;
  const ownerApplication = owner;
  const contentReadApplication = contentRead!;
  const contentOwnerApplication = contentOwner;
  const server = http.createServer((request, response) => {
    if (!validAuthority(request, authority)) return sendJson(response, 400, { error: { code: 'bad_request', message: 'Invalid Host authority' } });
    const pathname = rawPathname(request.url, authority);
    if (pathname === null) return sendJson(response, 400, { error: { code: 'bad_request', message: 'Malformed request URL' } });
    if (pathname === '/healthz') return health(request, response, configuration.version, configuration.ownerWritesEnabled);
    if (pathname === '/api/content' || pathname.startsWith('/api/content/')) return contentReadApplication.handler(request, response);
    if (pathname === '/api' || pathname.startsWith('/api/')) return readApplication.handler(request, response);
    if (pathname === '/owner-api' || pathname.startsWith('/owner-api/')) {
      if (!ownerApplication) return sendJson(response, 403, { error: { code: 'forbidden', message: 'OWNER writes are disabled' } });
      if (pathname === '/owner-api/content' || pathname.startsWith('/owner-api/content/')) return contentOwnerApplication!.handler(request, response);
      return ownerApplication.handler(request, response);
    }
    return serveStatic(request, response, pathname, frontend);
  });
  let closePromise: Promise<void> | undefined;
  return {
    server, origin,
    close: () => {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        const errors: unknown[] = [];
        await new Promise<void>((resolve) => {
          if (!server.listening) return resolve();
          server.close((error) => { if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') errors.push(error); resolve(); });
          server.closeIdleConnections();
        });
        try { contentOwnerApplication?.close(); } catch (error) { errors.push(error); }
        try { contentReadApplication.close(); } catch (error) { errors.push(error); }
        try { ownerApplication?.close(); } catch (error) { errors.push(error); }
        try { readApplication.close(); } catch (error) { errors.push(error); }
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, 'Operator app shutdown failed');
      })();
      return closePromise;
    },
  };
}

function validateConfiguration(configuration: OperatorAppConfiguration): StaticFiles {
  if (!configuration.databasePath || !configuration.artifactRoot) throw new TypeError('TDN_WORKSPACE_DB and TDN_ARTIFACT_ROOT are required');
  if (configuration.host !== '127.0.0.1' && configuration.host !== '::1') throw new TypeError('TDN_OPERATOR_APP_HOST must be exactly 127.0.0.1 or ::1');
  if (!Number.isSafeInteger(configuration.port) || configuration.port < 1 || configuration.port > 65535) throw new TypeError('TDN_OPERATOR_APP_PORT must be an integer from 1 to 65535');
  if (!configuration.version || /[\r\n]/.test(configuration.version)) throw new TypeError('Application version is invalid');
  if (configuration.ownerWritesEnabled && (!configuration.ownerToken || !TOKEN.test(configuration.ownerToken))) throw new TypeError('TDN_OWNER_API_TOKEN must be a strong 32-512 character token containing letters and digits when OWNER writes are enabled');
  if (configuration.ownerWritesEnabled && (!configuration.ownerActorId || !ACTOR.test(configuration.ownerActorId))) throw new TypeError('TDN_OWNER_API_ACTOR_ID is required and invalid when OWNER writes are enabled');
  return preloadFrontend(configuration.frontendDist);
}

function preloadFrontend(frontendDist: string): StaticFiles {
  const root = path.resolve(frontendDist);
  let rootStat: fs.Stats;
  try { rootStat = fs.lstatSync(root); } catch { throw new TypeError('frontend/dist is missing; run npm run frontend:build before starting the operator app'); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new TypeError('frontend/dist must be a real directory');
  if ((rootStat.mode & 0o500) !== 0o500) throw new TypeError('frontend/dist is unreadable');
  const files = new Map<string, StaticFile>();
  const visit = (directory: string, relativeDirectory: string): void => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { throw new TypeError('frontend/dist contains an unreadable directory'); }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) throw new TypeError('frontend/dist must not contain dotfiles');
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(relativeDirectory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new TypeError('frontend/dist must not contain symbolic links');
      if (stat.isDirectory()) {
        if ((stat.mode & 0o500) !== 0o500) throw new TypeError('frontend/dist contains an unreadable directory');
        visit(absolute, relative);
        continue;
      }
      if (!stat.isFile()) throw new TypeError('frontend/dist may contain only regular files and directories');
      if ((stat.mode & 0o400) === 0) throw new TypeError('frontend/dist contains an unreadable file');
      const extension = path.extname(entry.name).toLowerCase();
      if (extension === '.map') continue;
      const mime = MIME_TYPES[extension];
      if (!mime) throw new TypeError('frontend/dist contains an unsupported file type');
      let bytes: Buffer;
      try { bytes = fs.readFileSync(absolute); } catch { throw new TypeError('frontend/dist contains an unreadable file'); }
      files.set('/' + relative, Object.freeze({ bytes, mime }));
    }
  };
  visit(root, '');
  const index = files.get('/index.html');
  if (!index) throw new TypeError('frontend/dist/index.html is missing; run npm run frontend:build before starting the operator app');
  verifyIndexReferences(index.bytes.toString('utf8'), files);
  return files;
}

function verifyIndexReferences(html: string, files: StaticFiles): void {
  const tags = html.matchAll(/<(script|link)\b[^>]*?\b(?:src|href)\s*=\s*(["'])(.*?)\2/gi);
  for (const match of tags) {
    const reference = match[3]!;
    if (!reference || /[?#\\\0]/.test(reference) || reference.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(reference)) throw new TypeError('frontend/dist/index.html contains an invalid local asset reference');
    let decoded: string;
    try { decoded = decodeURIComponent(reference); } catch { throw new TypeError('frontend/dist/index.html contains a malformed asset reference'); }
    const rawTarget = decoded.startsWith('/') ? decoded : '/' + decoded.replace(/^\.\//, '');
    if (rawTarget.split('/').some((part) => part === '.' || part === '..')) throw new TypeError('frontend/dist/index.html references a missing or escaping asset');
    const target = path.posix.normalize(rawTarget);
    if (!target.startsWith('/') || target === '/' || !files.has(target)) throw new TypeError('frontend/dist/index.html references a missing or escaping asset');
  }
}

function operatorOrigin(host: '127.0.0.1' | '::1', port: number): string { return new URL(`http://${host === '::1' ? '[::1]' : host}:${port}`).origin; }
function validAuthority(request: IncomingMessage, expected: string): boolean {
  const hosts = request.rawHeaders.reduce<string[]>((values, value, index, all) => index % 2 === 0 && value.toLowerCase() === 'host' ? [...values, all[index + 1]!] : values, []);
  return hosts.length === 1 && hosts[0] === expected;
}
function rawPathname(raw: string | undefined, authority: string): string | null {
  if (!raw || /[\0\\]|%(?:2e|2f|5c|00)/i.test(raw)) return null;
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    const url = new URL(raw, `http://${authority}`);
    if (absolute && (url.protocol !== 'http:' || url.host !== authority || url.username || url.password)) return null;
    if (url.hash || url.pathname.includes('//')) return null;
    return url.pathname;
  } catch { return null; }
}
function health(request: IncomingMessage, response: ServerResponse, version: string, enabled: boolean): void {
  if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Only GET is supported' } }); }
  sendJson(response, 200, { status: 'ok', version, ownerWritesEnabled: enabled });
}
function serveStatic(request: IncomingMessage, response: ServerResponse, pathname: string, files: StaticFiles): void {
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.setHeader('Allow', 'GET, HEAD'); return sendText(response, 405, 'Method not allowed'); }
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return sendText(response, 400, 'Bad request'); }
  if (decoded.split('/').some((part) => part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) return sendText(response, 400, 'Bad request');
  const key = decoded === '/' ? '/index.html' : decoded;
  if (key !== '/index.html' && key.endsWith('/')) return sendText(response, 404, 'Not found');
  const file = files.get(key);
  if (!file) return sendText(response, 404, 'Not found');
  response.writeHead(200, staticHeaders({ 'Content-Type': file.mime, 'Content-Length': String(file.bytes.length), 'Cache-Control': file.mime.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600' }));
  response.end(request.method === 'HEAD' ? undefined : file.bytes);
}
function staticHeaders(extra: Record<string, string>): Record<string, string> { return { ...extra, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" }; }
function sendJson(response: ServerResponse, status: number, body: unknown): void { const bytes = Buffer.from(JSON.stringify(body)); response.writeHead(status, staticHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store' })); response.end(bytes); }
function sendText(response: ServerResponse, status: number, body: string): void { const bytes = Buffer.from(body); response.writeHead(status, staticHeaders({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': String(bytes.length), 'Cache-Control': 'no-store' })); response.end(bytes); }
