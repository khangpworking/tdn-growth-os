// Isolated reader process models a newer release: the active calculator is
// unavailable and its adopted authority has changed. No source file is edited.
import { registerHooks } from 'node:module';
import Database from 'better-sqlite3';
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (url.endsWith('/report-descriptive-extension.ts')) return { ...loaded, format: 'module', source:
      'export function buildVerifiedReportDescriptiveExtension() { throw new Error("active calculator unavailable"); }' };
    if (url.endsWith('/descriptive-method-bridge.ts')) {
      const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString();
      return { ...loaded, source: source.replaceAll('ddd4c0dcebc9a07a215646abce5152060f7d0c45c2582676ef84e2eb1ae3d8f7', 'a'.repeat(64)) };
    }
    return loaded;
  },
});
const [{ ContentAddressedArtifactStore }, { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader }, { ResearchAutomationService }] = await Promise.all([
  import('../../src/platform/artifacts/artifact-store.ts'),
  import('../../src/modules/flow/index.ts'),
  import('../../src/modules/analysis/research-automation/service.ts'),
]);
const [databasePath, artifactRoot, workspaceId, runId] = process.argv.slice(2);
const db = new Database(databasePath, { readonly: true, fileMustExist: true });
db.defaultSafeIntegers(true);
try {
  db.pragma('query_only = ON');
  const artifactStore = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore });
  const service = new ResearchAutomationService({ db, artifactStore, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery) });
  const report = await service.readReport(workspaceId, runId, 'MARKET');
  process.stdout.write(report.versionId);
} finally { db.close(); }
