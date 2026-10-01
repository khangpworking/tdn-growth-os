import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourcePackageService, FoundationSourcePackageReader } from '../../src/modules/foundation/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { MetricInputPreparationService } from '../../src/modules/analysis/metric-input-preparation-service.js';
import { MetricPreparationReadinessService } from '../../src/modules/analysis/metric-preparation-readiness.js';
import { normalizeMetricWorkbookInput } from '../../src/modules/analysis/metric-source-profile.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { createResearchReportPacket } from '../../src/modules/analysis/versioned-report-packet.js';
import { M03SectionRecipeService } from '../../src/modules/analysis/m03-section-recipe.js';
import { buildM03ChartBundle } from '../../src/modules/analysis/m03-chart-bundle.js';
import { buildM03NarrativeEvidence } from '../../src/modules/analysis/m03-narrative-evidence.js';
import { renderM03FactualNarrative } from '../../src/modules/analysis/m03-factual-narrative.js';
import { renderM03SectionArtifact } from '../../src/modules/analysis/m03-section-artifact.js';
import { SectionArtifactRetentionLedgerService } from '../../src/modules/analysis/section-artifact-retention-ledger.js';
import { buildSourceBackedReport } from '../../src/modules/analysis/source-backed-report.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { tabletQuoteFixture } from './tablet-quote-fixture.js';
import { descriptiveMarketFixture } from './descriptive-market-fixture.js';
import { locatedInsightPackageFixture } from './located-insight-package-fixture.js';
import { reportMethodPacketsFixture } from './report-method-packets-fixture.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const byteDigest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fixtureBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

/** Real preparation and retention, using only generated synthetic sources. */
export async function preparedReportFixture(withQuote = false, withDescriptive = false, withLocated = false, withMethods = false, withSemanticInvalidMethods = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-prepared-report-'));
  const databasePath = path.join(directory, 'report.sqlite');
  const { db } = openDatabase({ databasePath });
  const artifactRoot = path.join(directory, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const cleanup = async () => {
    if (db.open) db.close();
    await fsp.rm(directory, { recursive: true, force: true });
  };
  try {
    const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
      cwd: root, input: JSON.stringify({ cells: { D2: null, E2: null } }),
      maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(generated.status, 0, generated.stderr.toString('utf8'));
    const workbook = generated.stdout;
    const manifest = fixtureBytes({
      contractVersion: '1.0.0', profileId: 'metric-shopee-product-list-sheet1-v1', profileVersion: '1.0.0',
      source: {
        sha256: byteDigest(workbook), label: 'Synthetic integrated report workbook',
        provenanceBasis: 'Generated test input; no provider collection', evidenceFamily: 'synthetic-prepared-report',
        sheetName: 'Sheet1', headerSha256: '8c2bdf296db44d3ab32e4e67908a0385cc34960717270a38ae05e325f5127bba', lastRow: 3,
      },
      scope: {
        key: 'synthetic-prepared-report', platform: 'shopee', selection: 'ON',
        start: '2026-08-17', end: '2026-09-15', periodBasis: 'Synthetic declared period',
        acquiredAt: '2026-09-16T01:00:00.000Z',
      },
      precision: { revenue: 'unknown', units: 'unknown' },
      labelCodebookVersion: 'synthetic-prepared-v1', wideUnknownPolicy: 'exclude',
    });
    const catalogBytes = fs.readFileSync(path.join(root, 'docs/research/report-section-catalog-v1.json'));
    const catalogSha256 = byteDigest(catalogBytes);
    const normalized = normalizeMetricWorkbookInput(workbook, manifest);
    const labels = fixtureBytes({
      contractVersion: '1.0.0', sourceSha256: byteDigest(workbook), codebookVersion: 'synthetic-prepared-v1',
      provenanceBasis: 'Synthetic explicit UNKNOWN and core classifications',
      rows: normalized.receipt.evidence.map((row, index) => ({
        row: row.row, rowSha256: row.rowSha256, shopId: row.shopId, listingId: row.listingId,
        contentSha256: row.contentSha256, classification: index === 0 ? 'UNKNOWN' : 'CORE_CANDIDATE',
        group: index === 0 ? 'UNKNOWN' : 'Synthetic core', methodVersion: 'synthetic-prepared-v1', adjudication: 'unknown',
      })),
    });
    const quoteSource = fixtureBytes({ quote: { displayedPrice: '240000', packText: '30 tablets' } });
    const quote = tabletQuoteFixture();
    quote.sourceRef = { artifactSha256: byteDigest(quoteSource), locator: 'json://quote-source#/quote' };
    quote.priceVnd!.provenance.sourceRef = { ...quote.sourceRef };
    const members = new Map([
      ['metric/workbook.xlsx', workbook], ['metric/workbook-alias.xlsx', workbook],
      ['metric/manifest.json', manifest], ['metric/labels.json', labels],
      ['quote/source.json', quoteSource], ['quote/input.json', fixtureBytes(quote)],
    ]);
    const descriptive = withDescriptive ? descriptiveMarketFixture() : null;
    const located = withLocated ? locatedInsightPackageFixture() : null;
    const methods = withMethods ? (() => {
      const normalizedWithLabels = normalizeMetricWorkbookInput(workbook, manifest, labels);
      const result = calculateMetricScopes(normalizedWithLabels.input);
      const resultBytes = fixtureBytes(result);
      const resultSha256 = byteDigest(resultBytes);
      // Claims bind the exact retained metric-result bytes. Packet metadata can
      // still gain package-bound method artifacts after package intake without
      // creating a descriptor/packet digest cycle.
      const claimPacket = createResearchReportPacket(resultBytes, resultSha256, catalogBytes, catalogSha256).packet;
      return reportMethodPacketsFixture(claimPacket, resultSha256, withSemanticInvalidMethods);
    })() : null;
    for (const file of descriptive?.files ?? []) members.set(file.path, file.bytes);
    for (const file of located?.files ?? []) members.set(file.path, file.bytes);
    for (const file of methods?.files ?? []) members.set(file.path, file.bytes);
    const descriptiveMetadata = new Map([
      ...(descriptive?.files ?? []), ...(located?.files ?? []), ...(methods?.files ?? []),
    ].map(({ bytes: _bytes, ...metadata }) => [metadata.path, metadata]));
    const packages = new SourcePackageService({ db, artifactStore: artifacts });
    const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts });
    const sourcePackage = await packages.intake({
      contractVersion: '1.0.0', packageKey: 'metric:synthetic-prepared-report', version: 1,
      sourceAcquiredAt: null, sourceLabel: 'Synthetic integrated report package',
      files: [...members].map(([logicalPath, bytes]) => descriptiveMetadata.get(logicalPath) ?? ({
        path: logicalPath, sha256: byteDigest(bytes), byteSize: bytes.length,
        mediaType: logicalPath.endsWith('.xlsx')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json',
        evidenceFamily: logicalPath.startsWith('quote/') ? 'synthetic-tablet-quote' : 'synthetic-prepared-report',
        representationRole: logicalPath === 'quote/source.json' ? 'primary' as const : 'structured' as const,
        independence: 'non_independent' as const, providerProvenance: 'synthetic' as const,
        provenanceBasis: 'Generated fixture; provider authenticity not established',
        ...(logicalPath.startsWith('quote/') ? {
          period: { start: '2026-09-21T00:00:00.000Z', end: '2026-09-21T23:59:59.999Z' },
        } : {}),
      })),
    }, members);
    const workspace = await workspaces.createWorkspace({
      contractVersion: '1.0.0', workspaceKey: 'synthetic-prepared-report', title: 'Synthetic <Prepared> & report',
    });
    const dependencies = {
      sourcePackages: new FoundationSourcePackageReader(packages), workspaces: new FlowDiscoveryWorkspaceReader(workspaces),
    };
    const preparations = new MetricInputPreparationService({ db, artifactStore: artifacts, ...dependencies });
    const preparationRequest = {
      contractVersion: '1.0.0' as const, workspaceId: workspace.workspaceId, packageId: sourcePackage.packageId,
      packageManifestSha256: sourcePackage.manifestArtifactSha256, workbookPath: 'metric/workbook.xlsx',
      manifestPath: 'metric/manifest.json', labelsPath: 'metric/labels.json',
    };
    const prepared = await preparations.prepare(preparationRequest);
    const preparation = await preparations.readVerified(prepared.preparationSha256);
    const readiness = await new MetricPreparationReadinessService(preparations).evaluate(prepared.preparationSha256, catalogBytes, catalogSha256);
    const metricSet = await new M03SectionRecipeService(preparations).calculate({
      contractVersion: '1.0.0', sectionId: 'M03', recipeId: 'm03-scope-totals', recipeVersion: '1.0.0',
      preparationSha256: prepared.preparationSha256, catalogSha256, readinessSha256: readiness.readinessSha256,
    }, catalogBytes);
    const chartBundle = buildM03ChartBundle({
      contractVersion: '1.0.0', sectionId: 'M03', chartProfile: 'm03-chart-profile-v1', metricSetSha256: metricSet.metricSetSha256,
    }, metricSet);
    const envelope = buildM03NarrativeEvidence({
      contractVersion: '1.0.0', sectionId: 'M03', profile: 'm03-narrative-evidence-v1',
      metricSetSha256: metricSet.metricSetSha256, chartBundleSha256: chartBundle.chartBundleSha256,
    }, metricSet, chartBundle);
    const narrative = renderM03FactualNarrative({
      contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-factual-narrative-vi-v1', envelopeSha256: envelope.envelopeSha256,
    }, envelope, metricSet, chartBundle);
    const rendered = renderM03SectionArtifact({
      contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-section-artifact-html-vi-v1', narrativeSha256: narrative.narrativeSha256,
    }, metricSet, chartBundle, envelope, narrative);
    const sectionArtifacts = new SectionArtifactRetentionLedgerService({ db, artifactStore: artifacts });
    const retained = await sectionArtifacts.retain({
      contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-section-artifact-html-vi-v1',
      metricSetSha256: metricSet.metricSetSha256, chartBundleSha256: chartBundle.chartBundleSha256,
      envelopeSha256: envelope.envelopeSha256, narrativeSha256: narrative.narrativeSha256,
      sectionArtifactSha256: rendered.artifact.artifactSha256, htmlSha256: rendered.artifact.html.sha256,
    }, {
      // Accepted A37 formatting must survive A10 retention as exact original bytes.
      metricSet: Buffer.from(`${JSON.stringify(metricSet, null, 2)}\n`, 'utf8'),
      chartBundle: fixtureBytes(chartBundle), envelope: fixtureBytes(envelope),
      narrative: fixtureBytes(narrative), receipt: fixtureBytes(rendered.artifact), html: Buffer.from(rendered.html, 'utf8'),
    });
    const retainedM03 = await sectionArtifacts.read(retained.sectionArtifactSha256);
    const sourceRequest = {
      ...preparationRequest, catalogSha256, tabletQuoteSourcePath: withQuote ? 'quote/source.json' : null,
      tabletQuoteInputPath: withQuote ? 'quote/input.json' : null,
    };
    const bundle = await buildSourceBackedReport(sourceRequest, catalogBytes, dependencies);
    return {
      directory, databasePath, db, artifacts, artifactRoot, dependencies, preparations, sectionArtifacts,
      preparation, readiness, retainedM03, sourceRequest, catalogBytes, bundle, descriptive, located, methods, cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export function mutationSnapshot(state: Pick<Awaited<ReturnType<typeof preparedReportFixture>>, 'db' | 'artifactRoot'>) {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push(`${path.relative(state.artifactRoot, file)}:${byteDigest(fs.readFileSync(file))}:${fs.statSync(file).mtimeMs}`);
    }
  };
  visit(state.artifactRoot);
  return {
    changes: state.db.prepare('SELECT total_changes() changes').get(),
    manifests: state.db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(),
    files: files.sort(),
  };
}
