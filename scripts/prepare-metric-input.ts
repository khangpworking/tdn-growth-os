import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MetricInputPreparationService } from '../src/modules/analysis/index.js';
import { FoundationSourcePackageReader, SourcePackageService } from '../src/modules/foundation/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    throw new Error('Usage: npm run research:metric:prepare -- <database> <artifact-root> <request.json>');
  }
  const [databaseArgument, artifactArgument, requestArgument] = args;
  const databasePath = await outsideRepository(databaseArgument!, 'Database');
  const artifactRoot = await outsideRepository(artifactArgument!, 'Artifact root');
  const requestPath = path.resolve(requestArgument!);
  let request: unknown;
  try { request = JSON.parse(await fs.readFile(requestPath, 'utf8')); }
  catch { throw new Error('Metric input preparation request is not valid JSON'); }

  const opened = openDatabase({ databasePath });
  try {
    const artifactStore = new ContentAddressedArtifactStore(artifactRoot);
    const sourcePackageService = new SourcePackageService({ db: opened.db, artifactStore });
    const workspaceService = new DiscoveryWorkspaceService({ db: opened.db, artifactStore });
    const service = new MetricInputPreparationService({
      db: opened.db,
      artifactStore,
      sourcePackages: new FoundationSourcePackageReader(sourcePackageService),
      workspaces: new FlowDiscoveryWorkspaceReader(workspaceService),
    });
    const execution = await service.prepare(request);
    await service.readVerified(execution.preparationSha256);
    console.log(JSON.stringify({ ...execution, calculations: 0, aiCalls: 0, providerCalls: 0 }, null, 2));
  } finally {
    opened.db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Metric input preparation failed');
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
