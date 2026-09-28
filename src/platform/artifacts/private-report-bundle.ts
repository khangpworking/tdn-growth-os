import fs from 'node:fs/promises';
import path from 'node:path';

/** Read a bounded regular input; never follow a final symlink. */
export async function readReportInput(file: string, limit = 32 * 1024 * 1024): Promise<Buffer> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('Unsafe or oversized report input');
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error('Report input changed while opening');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const part = await handle.read(buffer, length, buffer.length - length);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    if (length > limit) throw new Error('Report input exceeds size limit');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

/**
 * Immutable private export, not a DB transaction. An interrupted partial bundle
 * is rejected; no overwrite, root sweep or repair of another invocation occurs.
 */
export async function publishPrivateReportBundle(
  output: string,
  files: ReadonlyMap<string, Buffer>,
): Promise<{ directory: string; reused: boolean }> {
  if (!files.size) throw new Error('Cannot publish an empty report');
  let totalBytes = 0;
  for (const [name, bytes] of files) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name) || name === '.git') throw new Error('Unsafe report filename');
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > 32 * 1024 * 1024 || totalBytes > 128 * 1024 * 1024) {
      throw new Error('Report export exceeds size limit');
    }
  }
  const resolved = path.resolve(output), parent = await fs.realpath(path.dirname(resolved));
  const directory = path.join(parent, path.basename(resolved));
  for (let current = parent; ; current = path.dirname(current)) {
    try { await fs.lstat(path.join(current, '.git')); throw new Error('Report output must be outside Git'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
  let created = false;
  const owned: string[] = [];
  try {
    try { await fs.mkdir(directory, { mode: 0o700 }); created = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (!created) {
      const info = await fs.lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink() ||
          (process.platform !== 'win32' && (info.mode & 0o777) !== 0o700)) throw new Error('Unsafe existing report bundle');
      if (JSON.stringify((await fs.readdir(directory)).sort()) !== JSON.stringify([...files.keys()].sort())) {
        throw new Error('Incomplete or unexpected report bundle; refusing overwrite');
      }
      for (const [name, bytes] of files) {
        const target = path.join(directory, name), stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.length ||
            (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) ||
            !(await readReportInput(target, bytes.length)).equals(bytes)) {
          throw new Error('Report bundle conflict; refusing overwrite');
        }
      }
    } else {
      for (const [name, bytes] of files) {
        const target = path.join(directory, name), handle = await fs.open(target, 'wx', 0o600);
        owned.push(target);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      }
      if (process.platform !== 'win32') {
        const handle = await fs.open(directory, 'r');
        try { await handle.sync(); } finally { await handle.close(); }
      }
    }
    return { directory, reused: !created };
  } catch (error) {
    if (created) {
      for (const target of owned) await fs.unlink(target).catch(() => undefined);
      // Only succeeds if no unrelated file has appeared; never recursively delete.
      await fs.rmdir(directory).catch(() => undefined);
    }
    throw error;
  }
}
