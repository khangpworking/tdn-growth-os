import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FoundationSourcePackageReader,
  SourcePackageService,
} from '../src/modules/foundation/index.js';
import {
  DiscoveryWorkspaceService,
  FlowDiscoveryWorkspaceReader,
} from '../src/modules/flow/index.js';
import {
  AnalysisReportVersionReader,
  NormalizedMetricObservationStore,
  ReportVersionService,
} from '../src/modules/analysis/index.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    throw new Error('Usage: npm run research:report:version -- <database> <artifact-root> <request.json> <section-catalog.json>');
  }
  const [databaseArgument, artifactArgument, requestArgument, catalogArgument] = args;
  const databasePath = await outsideRepository(databaseArgument!, 'Database');
  const artifactRoot = await outsideRepository(artifactArgument!, 'Artifact root');
  const requestPath = path.resolve(requestArgument!);
  const catalogPath = path.resolve(catalogArgument!);
  const [requestText, catalogBytes] = await Promise.all([
    fs.readFile(requestPath, 'utf8'),
    fs.readFile(catalogPath),
  ]);
  let request: unknown;
  try { request = JSON.parse(requestText); }
  catch { throw new Error('Report version request is not valid JSON'); }

  const opened = openDatabase({ databasePath });
  try {
    const artifactStore = new ContentAddressedArtifactStore(artifactRoot);
    const sourcePackages = new SourcePackageService({ db: opened.db, artifactStore });
    const workspaces = new DiscoveryWorkspaceService({ db: opened.db, artifactStore });
    const reports = new ReportVersionService({
      db: opened.db,
      artifactStore,
      dependencies: {
        sourcePackages: new FoundationSourcePackageReader(sourcePackages),
        workspaces: new FlowDiscoveryWorkspaceReader(workspaces),
      },
    });
    const execution = await reports.createVersion(request, catalogBytes);
    const normalized = await new NormalizedMetricObservationStore({
      db: opened.db,
      reports: new AnalysisReportVersionReader(reports),
    }).materializeReportVersion(execution.reportId, execution.version);
    console.log(JSON.stringify({
      ...execution,
      normalized,
      aiCalls: 0,
      providerCalls: 0,
      interpretationState: 'NONE',
      reviewState: 'UNREVIEWED',
    }, null, 2));
  } finally {
    opened.db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Report version creation failed');
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
