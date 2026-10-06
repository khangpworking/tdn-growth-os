import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import BetterSqlite3 from 'better-sqlite3';
import { SourcePackageService } from '../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../src/modules/foundation/source-package-reader.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/artifact-store.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import { PageIndexCloudClient } from '../src/modules/analysis/pageindex-cloud.js';
import type { PageIndexCloudQuery } from '../contracts/analysis/pageindex-cloud-query.generated.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failure = (code: string): never => { throw new Error(`PAGEINDEX_${code}`); };

async function privateFile(file: string, bytes: Uint8Array): Promise<void> {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 4) failure('USAGE_DATABASE_ARTIFACTS_REQUEST_NEW_PRIVATE_OUTPUT');
  const [database, artifactRoot, requestPath, rawOutput] = args as [string, string, string, string];
  const client = new PageIndexCloudClient({ enabled: process.env.TDN_PAGEINDEX_CLOUD_ENABLED === 'true',
    apiKey: process.env.PAGEINDEX_API_KEY ?? '' });
  const requestStat = await fs.lstat(requestPath);
  if (!requestStat.isFile() || requestStat.isSymbolicLink() || requestStat.size > 16 * 1024) failure('REQUEST_INVALID');
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(requestPath)));
  const schema: object = JSON.parse(await fs.readFile(path.join(root, 'contracts/analysis/pageindex-cloud-query.schema.json'), 'utf8'));
  const validate = new Ajv({ strict: true, allErrors: true }).compile<PageIndexCloudQuery>(schema);
  if (!validate(input)) failure('REQUEST_INVALID');
  const request = input as PageIndexCloudQuery;
  const dbStat = await fs.lstat(database), artifactStat = await fs.lstat(artifactRoot);
  if (!dbStat.isFile() || dbStat.isSymbolicLink() || !artifactStat.isDirectory() || artifactStat.isSymbolicLink()) failure('SOURCE_STORAGE_INVALID');
  const db = new BetterSqlite3(path.resolve(database), { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON'); db.pragma('foreign_keys = ON'); db.defaultSafeIntegers(true);
    const reader = new FoundationSourcePackageReader(new SourcePackageService({ db,
      artifactStore: new ContentAddressedArtifactStore(artifactRoot) }));
    const source = await reader.readFinalizedSourcePackage(request.sourcePackageId, {
      maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
    if (source.manifestArtifactSha256 !== request.manifestSha256) failure('SOURCE_IDENTITY_MISMATCH');
    const file = source.files.find(entry => entry.path === request.logicalPath);
    if (!file || file.sha256 !== request.sourceSha256 || file.mediaType !== 'application/pdf' || file.bytes.length > 32 * 1024 * 1024) return failure('SOURCE_IDENTITY_MISMATCH');
    // Local extraction consumes verified bytes, not a vendor OCR response.
    const localPages: { page: number; text: string }[] = await new Promise((resolve, reject) => {
      const child = execFile(process.env.TDN_PAGEINDEX_PYTHON ?? 'python3', [path.join(root, 'scripts/read-pageindex-pdf.py')],
        { timeout: 30_000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
          if (error) { reject(new Error('PAGEINDEX_LOCAL_PDF_INVALID')); return; }
          try { resolve(JSON.parse(stdout) as { page: number; text: string }[]); }
          catch { reject(new Error('PAGEINDEX_LOCAL_PDF_INVALID')); }
        });
      child.stdin?.on('error', () => undefined); child.stdin?.end(file.bytes);
    });
    if (!Array.isArray(localPages)) failure('LOCAL_PDF_INVALID');
    const output = path.resolve(rawOutput), parent = path.dirname(output);
    if (await fs.realpath(parent) !== parent) failure('OUTPUT_INVALID');
    // Any Git checkout is forbidden, including a linked worktree's .git file.
    for (let current = parent; ; current = path.dirname(current)) {
      const git = await fs.lstat(path.join(current, '.git')).catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      });
      if (git) failure('OUTPUT_IN_GIT');
      if (path.dirname(current) === current) break;
    }
    await fs.mkdir(output, { mode: 0o700 }).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') failure('OUTPUT_EXISTS_NO_RETRY');
      throw error;
    });
    const parentDirectory = await fs.open(parent, 'r');
    try { await parentDirectory.sync(); } finally { await parentDirectory.close(); }
    const requestBytes = Buffer.from(canonicalJson(request) + '\n');
    const requestSha256 = createHash('sha256').update(requestBytes).digest('hex');
    await privateFile(path.join(output, 'request.json'), requestBytes);
    await privateFile(path.join(output, 'attempt.json'), Buffer.from(canonicalJson({ requestSha256,
      startedAt: new Date().toISOString(), state: 'ATTEMPTED_NO_AUTOMATIC_RETRY' }) + '\n'));
    const directory = await fs.open(output, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
    const result = await client.query(request, file.bytes, localPages);
    const resultBytes = Buffer.from(canonicalJson(result) + '\n');
    await privateFile(path.join(output, 'result.json'), resultBytes);
    await privateFile(path.join(output, 'receipt.json'), Buffer.from(canonicalJson({ requestSha256,
      resultSha256: createHash('sha256').update(resultBytes).digest('hex'), completedAt: new Date().toISOString(),
      approvalState: 'UNREVIEWED', databaseMutations: 0, cloudChatCalls: 1 }) + '\n'));
    const completedDirectory = await fs.open(output, 'r');
    try { await completedDirectory.sync(); } finally { await completedDirectory.close(); }
    console.log(JSON.stringify({ approvalState: 'UNREVIEWED', candidates: result.candidates.length,
      locallyMatched: result.candidates.filter(c => c.verification === 'LOCAL_PDF_TEXT_MATCH').length,
      databaseMutations: 0, cloudChatCalls: 1 }));
  } finally { db.close(); }
}

await main().catch(error => {
  console.error(error instanceof Error && /^PAGEINDEX_[A-Z0-9_]+$/u.test(error.message)
    ? error.message : 'PAGEINDEX_QUERY_FAILED');
  process.exitCode = 1;
});
