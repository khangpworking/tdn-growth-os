import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import {
  AnalysisResultReader,
  AnalysisShopeeReviewResultReader,
  CombinedMarketReviewReportReader,
  MarketSnapshotService,
  renderCombinedMarketReviewReport,
} from '../src/modules/analysis/index.js';
import { DataPackService, FoundationDataPackReader, ShopeeCollectionService } from '../src/modules/foundation/index.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';

const args = process.argv.slice(2);
try {
  if (args.length !== 5) throw new Error(usage());
  const [databaseArgument, artifactArgument, marketResultSha256, reviewResultSha256, outputArgument] = args as
    [string, string, string, string, string];
  const databasePath = path.resolve(databaseArgument);
  const artifactRoot = path.resolve(artifactArgument);
  const outputPath = path.resolve(outputArgument);
  const verifiedOutputPath = await assertOutputOutsideRepository(outputPath);

  if (!(await fs.stat(databasePath)).isFile()) throw new Error('Database path is not a file');
  if (!(await fs.stat(artifactRoot)).isDirectory()) throw new Error('Artifact root is not a directory');

  const db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    const artifacts = new ContentAddressedArtifactStore(artifactRoot);
    const packs = new DataPackService({ db, artifactStore: artifacts });
    const marketService = new MarketSnapshotService({
      db,
      artifactStore: artifacts,
      dataPackReader: new FoundationDataPackReader(packs),
    });
    const collections = new ShopeeCollectionService(db, artifacts);
    const reader = new CombinedMarketReviewReportReader({
      db,
      marketResultReader: new AnalysisResultReader(marketService),
      reviewResultReader: new AnalysisShopeeReviewResultReader({
        db,
        artifactStore: artifacts,
        collectionReader: collections,
      }),
    });
    const input = await reader.read(marketResultSha256, reviewResultSha256);
    const report = renderCombinedMarketReviewReport(input);
    await writeExclusiveOwnerOnly(verifiedOutputPath, Buffer.from(report, 'utf8'));
    console.log(JSON.stringify({
      marketResultSha256,
      reviewResultSha256,
      outputPath,
      bytes: Buffer.byteLength(report, 'utf8'),
      providerCalls: 0,
      analysisCalls: 0,
      databaseMutations: 0,
    }, null, 2));
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Combined market/review report export failed');
  process.exitCode = 1;
}

function usage(): string {
  return 'Usage: npm run report:combined:export -- <database.sqlite> <artifact-root> <market-result-sha256> <review-result-sha256> <output.md>';
}

async function assertOutputOutsideRepository(outputPath: string): Promise<string> {
  const repositoryRoot = await fs.realpath(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
  const outputParent = await fs.realpath(path.dirname(outputPath));
  const verifiedOutputPath = path.join(outputParent, path.basename(outputPath));
  const relative = path.relative(repositoryRoot, verifiedOutputPath);
  if (relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..')) {
    throw new Error('Report output must be outside the Git repository');
  }
  return verifiedOutputPath;
}

async function writeExclusiveOwnerOnly(outputPath: string, bytes: Buffer): Promise<void> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(outputPath, 'wx', 0o600);
    if (process.platform !== 'win32') await handle.chmod(0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`Refusing to overwrite existing report: ${outputPath}`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}
