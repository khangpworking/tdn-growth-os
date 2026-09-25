import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** HTTP primitives for OWNER write APIs; same rules as `owner-api.ts`. */
export const OWNER_TOKEN = /^(?=.*[A-Za-z])(?=.*\d)[\x21-\x7e]{32,512}$/;

export interface OwnerHttpConfiguration {
  readonly writeEnabled: boolean;
  readonly databasePath: string;
  readonly artifactRoot: string;
  readonly token: string;
  readonly allowedOrigin: string;
  readonly actorId: string;
}

export class PayloadTooLargeError extends Error {}
export class EmptyBodyError extends Error {}

export function assertOwnerHttpConfiguration(value: OwnerHttpConfiguration): void {
  if (value.writeEnabled !== true) throw new TypeError('OWNER API write mode must be explicitly enabled');
  if (!value.databasePath || !value.artifactRoot) throw new TypeError('Explicit databasePath and artifactRoot are required');
  if (!OWNER_TOKEN.test(value.token)) throw new TypeError('OWNER API token must be 32-512 printable non-space ASCII characters containing letters and digits');
  let origin: URL; try { origin = new URL(value.allowedOrigin); } catch { throw new TypeError('OWNER API allowed origin must be an exact HTTP(S) origin'); }
  if (!/^https?:$/.test(origin.protocol) || origin.origin !== value.allowedOrigin || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new TypeError('OWNER API allowed origin must be an exact HTTP(S) origin');
  if (!/^[a-z][a-z0-9:_-]{2,119}$/.test(value.actorId)) throw new TypeError('OWNER API actor ID is invalid');
}

export function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function ownerAuthorized(request: IncomingMessage, expected: string): boolean {
  const value = singleHeader(request.headers.authorization);
  const supplied = value?.startsWith('Bearer ') ? value.slice(7) : '';
  const expectedBytes = Buffer.from(expected); const suppliedBytes = Buffer.from(supplied);
  const padded = Buffer.alloc(expectedBytes.length); suppliedBytes.copy(padded, 0, 0, expectedBytes.length);
  return timingSafeEqual(padded, expectedBytes) && suppliedBytes.length === expectedBytes.length;
}

export async function readOwnerBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return (await readOwnerBytes(request, maxBytes)).toString('utf8');
}

export async function readOwnerBytes(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) { request.resume(); throw new PayloadTooLargeError(); }
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length; if (size > maxBytes) throw new PayloadTooLargeError();
    chunks.push(bytes);
  }
  if (size === 0) throw new EmptyBodyError();
  return Buffer.concat(chunks);
}

export function ownerCors(response: ServerResponse, origin: string): void {
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Methods', 'POST');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Vary', 'Origin');
}

export function sendApiJson(response: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  response.end(bytes);
}
