import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';
import {
  AnalysisMetricInputPreparationReader,
  MetricInputPreparationService,
  MetricPreparationReadinessService,
} from '../src/modules/analysis/index.js';
import { FoundationSourcePackageReader, SourcePackageService } from '../src/modules/foundation/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 6) {
    throw new Error('Usage: npm run research:metric:readiness -- <database> <artifact-root> <preparation-sha256> <catalog.json> <catalog-sha256> <outside-output.json>');
  }
  const [databaseArgument, artifactArgument, preparationSha256, catalogArgument, catalogSha256, outputArgument] = args;
  const databasePath = await outsideRepository(databaseArgument!, 'Database');
  const artifactRoot = await outsideRepository(artifactArgument!, 'Artifact root');
  const outputPath = await outsideRepository(outputArgument!, 'Output');
  const catalogBytes = await fs.readFile(path.resolve(catalogArgument!));
  const db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('query_only = ON');
    db.defaultSafeIntegers(true);
    const artifactStore = new ContentAddressedArtifactStore(artifactRoot);
    const preparation = new MetricInputPreparationService({
      db,
      artifactStore,
      sourcePackages: new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore })),
      workspaces: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore })),
    });
    const readiness = new MetricPreparationReadinessService(new AnalysisMetricInputPreparationReader(preparation));
    const result = await readiness.evaluate(preparationSha256!, catalogBytes, catalogSha256!);
    await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    const handle = await fs.open(outputPath, 'wx', 0o600);
    try { await handle.writeFile(`${canonicalJson(result)}\n`, 'utf8'); }
    finally { await handle.close(); }
    console.log(JSON.stringify({
      readinessSha256: result.readinessSha256,
      preparationSha256: result.preparationSha256,
      ...result.summary,
      calculations: 0,
      aiCalls: 0,
      providerCalls: 0,
      outputPath,
    }, null, 2));
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Metric preparation readiness failed');
  process.exitCode = 1;
}

async function outsideRepository(argument: string, label: string): Promise<string> {
  const repositoryRoot = await fs.realpath(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
  const absolute = path.resolve(argument);
  let target: string;
  try { target = await fs.realpath(absolute); }
  catch { target = path.join(await fs.realpath(path.dirname(absolute)), path.basename(absolute)); }
  const relative = path.relative(repositoryRoot, target);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    throw new Error(`${label} must be outside the Git repository`);
  }
  return target;
}
