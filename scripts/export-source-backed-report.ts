import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import { SourcePackageService } from '../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../src/modules/foundation/source-package-reader.js';
import { DiscoveryWorkspaceService } from '../src/modules/flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../src/modules/flow/discovery-workspace-reader.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/artifact-store.js';
import { readReportInput, publishPrivateReportBundle } from '../src/platform/artifacts/private-report-bundle.js';
import { buildSourceBackedReport } from '../src/modules/analysis/source-backed-report.js';
import { renderResearchReportHtml } from '../src/modules/analysis/research-report-html.js';
import { buildReportSemanticContent, buildUnreviewedReportState } from '../src/modules/analysis/report-semantic-content.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 5) throw new Error('Usage: research:report:export -- <database.sqlite> <artifact-root> <request.json> <catalog.json> <outside-git-bundle-directory>');
  const [databasePath, artifactRoot, requestFile, catalogFile, output] = args as [string, string, string, string, string];
  const requestBytes = await readReportInput(requestFile, 16 * 1024);
  const request: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(requestBytes));
  const catalogBytes = await readReportInput(catalogFile);
  const dbStat = await fs.lstat(databasePath), rootStat = await fs.lstat(artifactRoot);
  if (!dbStat.isFile() || dbStat.isSymbolicLink() || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Existing regular database and artifact directory required');
  }
  const db = new BetterSqlite3(path.resolve(databasePath), { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    const artifacts = new ContentAddressedArtifactStore(artifactRoot);
    const bundle = await buildSourceBackedReport(request, catalogBytes, {
      sourcePackages: new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: artifacts })),
      workspaces: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore: artifacts })),
    });
    const files = new Map(bundle.files);
    files.set('evidence-envelope.json', bundle.envelopeBytes);
    const semantic = buildReportSemanticContent(bundle);
    const review = buildUnreviewedReportState(semantic.content.semanticVersionId);
    files.set('semantic-content.json', semantic.contentBytes);
    files.set('review-state.json', review.stateBytes);
    files.set('report.html', Buffer.from(renderResearchReportHtml({ ...bundle, files }, semantic.content.semanticVersionId)));
    // A content manifest binds every rendered/exported byte, without a self-hash.
    const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
    const exportManifest = {
      contractVersion: 'source-backed-export-v1', rendererVersion: 'research-evidence-html-vi-v1',
      approvalState: 'UNREVIEWED', packetId: bundle.packet.packetId,
      semanticVersionId: semantic.content.semanticVersionId,
      reviewStateSha256: digest(review.stateBytes),
      files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([name, bytes]) => ({ name, byteSize: bytes.length, sha256: digest(bytes) })),
    };
    files.set('export-manifest.json', Buffer.from(canonicalJson(exportManifest) + '\n'));
    const published = await publishPrivateReportBundle(output, files);
    console.log(JSON.stringify({ ...published, status: 'DRAFT', approvalState: 'UNREVIEWED',
      packetId: bundle.packet.packetId, exportManifestSha256: digest(files.get('export-manifest.json')!),
      semanticVersionId: semantic.content.semanticVersionId,
      sourceMapping: 'REPARSED_RETAINED_BYTES', providerAuthenticity: 'NOT_ESTABLISHED',
      sections: bundle.packet.sections.length, databaseMutations: 0, aiCalls: 0, providerCalls: 0 }));
  } finally { db.close(); }
}
await main().catch(error => { console.error(error instanceof Error ? error.message : 'Source-backed report export failed'); process.exitCode = 1; });
