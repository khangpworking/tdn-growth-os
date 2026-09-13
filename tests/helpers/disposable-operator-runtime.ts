import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { openOperatorApp, type OperatorAppApplication, type OperatorAppConfiguration } from '../../src/api/operator-app.js';
import { openDatabase } from '../../src/platform/db/database.js';

export const SYNTHETIC_OWNER_TOKEN = 'task045-synthetic-owner-token-0123456789-strong';
export const SYNTHETIC_OWNER_ACTOR = 'owner:task045-smoke';

export interface DisposableOperatorFixture {
  readonly root: string;
  readonly databasePath: string;
  readonly artifactRoot: string;
  readonly frontendDist: string;
  readonly port: number;
  readonly configuration: OperatorAppConfiguration;
}

export async function reserveLoopbackPort(): Promise<number> {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  assert.ok(port > 0);
  return port;
}

export async function disposableOperatorFixture(ownerWritesEnabled: boolean): Promise<DisposableOperatorFixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-task045-runtime-'));
  const databasePath = path.join(root, 'workspace.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const frontendDist = path.resolve('frontend/dist');
  assert.ok(fs.existsSync(path.join(frontendDist, 'index.html')), 'production frontend/dist is required; build it before running this smoke test');
  const migrated = openDatabase({ databasePath });
  assert.ok(migrated.migration.currentVersion > 0, 'disposable database was explicitly migrated');
  migrated.db.close();
  const port = await reserveLoopbackPort();
  return {
    root, databasePath, artifactRoot, frontendDist, port,
    configuration: {
      databasePath, artifactRoot, frontendDist, version: 'task045-smoke', host: '127.0.0.1', port, ownerWritesEnabled,
      ...(ownerWritesEnabled ? { ownerToken: SYNTHETIC_OWNER_TOKEN, ownerActorId: SYNTHETIC_OWNER_ACTOR } : {}),
    },
  };
}

export async function startOperator(configuration: OperatorAppConfiguration): Promise<OperatorAppApplication> {
  const application = openOperatorApp(configuration);
  application.server.listen(configuration.port, configuration.host);
  await once(application.server, 'listening');
  return application;
}

export async function assertPortClosed(port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); reject(new Error(`port ${port} remains open`)); });
    socket.once('error', (error: NodeJS.ErrnoException) => error.code === 'ECONNREFUSED' ? resolve() : reject(error));
  });
}

export async function postJson(origin: string, pathname: string, body: unknown, authorized = true): Promise<{ response: Response; value: any; text: string }> {
  const response = await fetch(origin + pathname, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(authorized ? { authorization: `Bearer ${SYNTHETIC_OWNER_TOKEN}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { response, value: JSON.parse(text), text };
}

export function regularFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

export function assertOwnerOnlyFiles(files: readonly string[]): void {
  if (process.platform === 'win32') return;
  for (const file of files) assert.equal(fs.statSync(file).mode & 0o777, 0o600, `${file} must be mode 0600`);
}
