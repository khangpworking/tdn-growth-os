import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

/**
 * Single-host executor lock (`<canonical db>.executor.lock`, ADR 0004). Acquisition is exclusive and
 * conservative: any existing lock file — live, dead, other-host, empty or malformed — stops startup and
 * is never modified here. Stale locks are removed only by the documented manual recovery procedure.
 */

export interface ExecutorLock {
  readonly path: string;
  /** Removes this acquisition's lock file after verifying file identity and owner nonce. Idempotent. */
  release(): void;
}

export class ExecutorLockHeldError extends Error {
  constructor(readonly lockPath: string, detail: string) {
    super(`Another operator executor may own this database (${detail}). Only one operator with OWNER writes enabled may use a database; follow the manual stale-lock recovery in the operator runbook if no executor is running.`);
    this.name = 'ExecutorLockHeldError';
  }
}

interface LockMetadata { readonly pid: number; readonly hostname: string; readonly startedAt: string; readonly ownerNonce: string }

const MAX_METADATA_BYTES = 1024;
const HOSTNAME = /^[A-Za-z0-9._-]{1,253}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Resolves the existing database file through symbolic links and relative segments; every application connection uses this path. */
export function canonicalDatabasePath(databasePath: string): string {
  let canonical: string;
  try { canonical = fs.realpathSync(databasePath); } catch { throw new TypeError('TDN_WORKSPACE_DB must name an existing database file'); }
  if (!fs.statSync(canonical).isFile()) throw new TypeError('TDN_WORKSPACE_DB must name a regular database file');
  return canonical;
}

export function acquireExecutorLock(canonicalPath: string): ExecutorLock {
  // Separate hard-link names would be separate lock identities for one database.
  if (fs.statSync(canonicalPath).nlink !== 1) throw new TypeError('TDN_WORKSPACE_DB must not be hard-linked; database hard-link aliases are unsupported');
  const lockPath = `${canonicalPath}.executor.lock`;
  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ExecutorLockHeldError(lockPath, describeExistingLock(lockPath));
    throw error;
  }
  const metadata: LockMetadata = { pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString(), ownerNonce: randomUUID() };
  let identity: fs.BigIntStats;
  try {
    identity = fs.fstatSync(fd, { bigint: true });
  } catch (error) {
    // Identity is unknown: the file cannot be proven ours, so it stays for manual recovery.
    closeQuietly(fd);
    throw error;
  }
  try {
    const bytes = Buffer.from(JSON.stringify(metadata), 'utf8');
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (error) {
    closeQuietly(fd);
    if (sameFile(lockPath, identity)) { try { fs.unlinkSync(lockPath); } catch { /* left for manual recovery */ } }
    throw error;
  }

  let released = false;
  return {
    path: lockPath,
    release() {
      if (released) return;
      let current: fs.BigIntStats;
      try { current = fs.lstatSync(lockPath, { bigint: true }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { released = true; return; }
        throw error;
      }
      if (!current.isFile() || current.dev !== identity.dev || current.ino !== identity.ino || readMetadata(lockPath)?.ownerNonce !== metadata.ownerNonce) {
        throw new Error('Executor lock ownership changed; the lock was left in place for manual recovery');
      }
      fs.unlinkSync(lockPath);
      released = true;
    },
  };
}

function describeExistingLock(lockPath: string): string {
  const metadata = readMetadata(lockPath);
  return metadata
    ? `lock held by pid ${metadata.pid} on ${metadata.hostname} since ${metadata.startedAt}`
    : 'an executor lock file exists with incomplete or unreadable metadata';
}

/** Bounded read; returns only fully valid metadata and never echoes arbitrary file text. */
function readMetadata(lockPath: string): LockMetadata | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(lockPath, 'r');
    const buffer = Buffer.alloc(MAX_METADATA_BYTES + 1);
    const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (length === 0 || length > MAX_METADATA_BYTES) return undefined;
    const value: unknown = JSON.parse(buffer.subarray(0, length).toString('utf8'));
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const { pid, hostname, startedAt, ownerNonce } = value as Record<string, unknown>;
    if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid < 1) return undefined;
    if (typeof hostname !== 'string' || !HOSTNAME.test(hostname)) return undefined;
    if (typeof startedAt !== 'string' || !ISO_TIMESTAMP.test(startedAt)) return undefined;
    if (typeof ownerNonce !== 'string' || !NONCE.test(ownerNonce)) return undefined;
    return { pid, hostname, startedAt, ownerNonce };
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeQuietly(fd);
  }
}

function sameFile(lockPath: string, identity: fs.BigIntStats): boolean {
  try {
    const current = fs.lstatSync(lockPath, { bigint: true });
    return current.isFile() && current.dev === identity.dev && current.ino === identity.ino;
  } catch {
    return false;
  }
}

function closeQuietly(fd: number): void { try { fs.closeSync(fd); } catch { /* already closed */ } }
