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
import { renderReportCitationPreview, REPORT_CITATION_PREVIEW_RENDERER } from '../src/modules/analysis/report-citation-html.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 5) throw new Error('Usage: node --import tsx scripts/export-report-citation-preview.ts <database.sqlite> <artifact-root> <request.json> <catalog.json> <outside-git-preview-directory>');
  const [databasePath, artifactRoot, requestFile, catalogFile, output] = args as [string, string, string, string, string];
  const request: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readReportInput(requestFile, 16 * 1024)));
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
    const preview = renderReportCitationPreview({ bundle });
    const files = new Map(bundle.files);
    files.set('evidence-envelope.json', bundle.envelopeBytes);
    files.set('citations.json', Buffer.from(canonicalJson(preview.projection) + '\n'));
    files.set('report.html', Buffer.from(preview.html));
    const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
    const manifest = {
      contractVersion: 'report-citation-preview-export-v1', rendererVersion: REPORT_CITATION_PREVIEW_RENDERER,
      approvalState: 'UNREVIEWED', presentationOnly: true, semanticVersionId: preview.projection.report.semanticVersionId,
      files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([name, bytes]) => ({ name, byteSize: bytes.length, sha256: digest(bytes) })),
    };
    files.set('export-manifest.json', Buffer.from(canonicalJson(manifest) + '\n'));
    const published = await publishPrivateReportBundle(output, files);
    console.log(JSON.stringify({ ...published, rendererVersion: REPORT_CITATION_PREVIEW_RENDERER,
      approvalState: 'UNREVIEWED', citations: preview.projection.citations.length, databaseMutations: 0, providerCalls: 0, aiCalls: 0 }));
  } finally { db.close(); }
}
await main().catch(error => { console.error(error instanceof Error ? error.message : 'Citation preview export failed'); process.exitCode = 1; });
