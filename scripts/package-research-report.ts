import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createResearchReportPacket } from '../src/modules/analysis/versioned-report-packet.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

async function boundedRead(file: string): Promise<Buffer> {
  const handle = await fs.open(file, 'r');
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Input must be a regular file');
    const buffer = Buffer.alloc(32 * 1024 * 1024 + 1);
    let length = 0;
    while (length < buffer.length) {
      const part = await handle.read(buffer, length, buffer.length - length);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    if (length === buffer.length) throw new Error('Input exceeds 32 MiB');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 5) throw new Error('Usage: research:report:packet -- <result.json> <exact-result-byte-sha256> <catalog.json> <exact-catalog-byte-sha256> <outside-git-bundle-directory>');
  const resultBytes = await boundedRead(args[0]!), catalogBytes = await boundedRead(args[2]!);
  const { packet, report } = createResearchReportPacket(resultBytes, args[1]!, catalogBytes, args[3]!);
  const packetBytes = Buffer.from(canonicalJson(packet) + '\n'), reportBytes = Buffer.from(report);
  const files: readonly [string, Buffer][] = [
    ['metric-result.json', resultBytes], ['section-catalog.json', catalogBytes], ['packet.json', packetBytes], ['report.md', reportBytes],
  ];
  const output = path.resolve(args[4]!), parent = await fs.realpath(path.dirname(output));
  for (let current = parent; ; current = path.dirname(current)) {
    try { await fs.lstat(path.join(current, '.git')); throw new Error('Output must be outside Git'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
  const directory = path.join(parent, path.basename(output));
  let created = false;
  const owned: string[] = [];
  try {
    try { await fs.mkdir(directory, { mode: 0o700 }); created = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (!created) {
      const info = await fs.lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.mode & 0o777) !== 0o700)) throw new Error('Unsafe existing bundle');
      if ((await fs.readdir(directory)).sort().join(',') !== files.map(([name]) => name).sort().join(',')) throw new Error('Incomplete or unexpected bundle');
      for (const [name, bytes] of files) {
        const file = path.join(directory, name), stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.length ||
            (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) || !(await boundedRead(file)).equals(bytes)) {
          throw new Error('Bundle conflict; refusing overwrite');
        }
      }
    } else {
      for (const [name, bytes] of files) {
        const file = path.join(directory, name), handle = await fs.open(file, 'wx', 0o600);
        owned.push(file);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      }
    }
    console.log(JSON.stringify({ status: 'DRAFT', approvalState: 'UNREVIEWED', packetId: packet.packetId,
      packetFileSha256: createHash('sha256').update(packetBytes).digest('hex'),
      reportSha256: createHash('sha256').update(reportBytes).digest('hex'), reused: !created,
      outputDirectory: directory, sections: packet.sections.length, observations: packet.claims.length, aiCalls: 0, databaseMutations: 0 }));
  } catch (error) {
    if (created) {
      for (const file of owned) await fs.unlink(file).catch(() => undefined);
      await fs.rmdir(directory).catch(() => undefined);
    }
    throw error;
  }
}
await main().catch(error => { console.error(error instanceof Error ? error.message : 'Report packet failed'); process.exitCode = 1; });
