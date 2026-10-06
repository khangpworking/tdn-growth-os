import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { GenericQuoteUnit } from '../../contracts/analysis/generic-quote-unit.generated.js';
import type { SourcePackageIntakeRequest } from '../../contracts/foundation/source-package-intake-request.generated.js';
import type { AutomationQuoteMethodSnapshot } from '../../contracts/analysis/automation-quote-method-snapshot.generated.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date('2026-10-04T00:00:00Z');
type Quote = GenericQuoteUnit['input']['quotes'][number];
type Descriptor = Omit<GenericQuoteUnit['input'], 'sourcePackage'>;
const payload = (value: unknown): unknown => Array.isArray(value) ? value.map(payload)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['source', 'binding', 'basisBinding', 'checkoutBinding', 'massSelectionBinding'].includes(key))
    .map(([key, child]) => [key, payload(child)])) : value;

// Expected numbers below are independent business examples, not computed by
// the production calculator. This owner also detects lost worker/report wiring.
test('M08 exact structured source produces traceable arithmetic in Market only, with frozen revision lifecycle', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-quote-revision-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const workspaceId = randomUUID(), runId = randomUUID();
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'quote-source', title: 'Synthetic quote source' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now, uuid: () => runId,
    renderer: (input, kind) => {
      const rendered = buildResearchAutomationReport(input, kind);
      return { ...rendered, semantic: { ...rendered.semantic, quoteMethods: { forged: true } } };
    } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'synthetic mixed catalogue', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: awaiting.revision, definition: 'Synthetic only', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] });
  await service.processNext(); await service.processNext();
  const original = (await service.listReportVersions(workspaceId, runId))[0]!;
  const originalMarket = (await service.readReport(workspaceId, runId, 'MARKET')).bytes;
  const originalInsight = (await service.readReport(workspaceId, runId, 'INSIGHT')).bytes;
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  const schemaBytes = await fs.readFile(new URL('../../contracts/analysis/generic-quote-unit.schema.json', import.meta.url));
  const intake = async (mutate?: (descriptor: Descriptor) => void, rawDuplicate = false) => {
    const files: Array<SourcePackageIntakeRequest['files'][number] & { bytes: Buffer }> = [];
    const source = (logicalPath: string, bytes: Buffer, role: Descriptor['sources'][number]['role'] = 'SOURCE') => {
      const digest = sha(bytes);
      files.push({ path: logicalPath, bytes, sha256: digest, byteSize: bytes.length, mediaType: 'application/json',
        evidenceFamily: 'synthetic-quotes', representationRole: 'structured', independence: 'non_independent',
        providerProvenance: 'synthetic', provenanceBasis: 'Synthetic fixture, not a collected listing' });
      return { logicalPath, sha256: digest, role };
    };
    const schema = source('profiles/quote.json', schemaBytes);
    const configuration = source('config/mapping.json', Buffer.from('{"mappingRevision":"literal-structured-quote-v1"}'));
    const ref = (file: typeof schema, fieldPointer: string) => ({ sourceSha256: file.sha256, locator: file.logicalPath + fieldPointer, fieldPointer });
    const placeholder = ref(schema, '/$id');
    const quotes: Quote[] = [0, 1, 2, 3].map(index => ({
      quoteId: `synthetic-${index}`, source: placeholder, acquiredAt: '2026-10-01T00:00:00Z', observedAt: null,
      authenticationState: 'UNKNOWN', reviewState: 'UNREVIEWED',
      identity: { state: 'EXACT', platform: 'synthetic', shopId: 'shop', listingId: `listing-${index}`, variantState: 'EXACT',
        variantId: `variant-${index}`, variantAttributes: [], binding: placeholder, linkage: 'MATCHED' },
      offerText: ['<script>jars</script>', 'Bottles', 'Fan', 'Range only'][index]!, packText: 'Synthetic pack',
      price: { state: index === 3 ? 'RANGE' : 'EXACT', value: index === 3 ? null : ['60000', '240000', '100'][index]!,
        range: index === 3 ? { minimum: '99', maximum: '199' } : null, currency: 'VND', priceState: 'PROMO_CONDITIONAL',
        binding: placeholder, checkoutBinding: null, conditions: [{ literal: 'Requires voucher', binding: placeholder }], tax: 'UNKNOWN', shipping: 'UNKNOWN' },
      pack: { count: { state: 'EXACT', value: index === 2 ? '3' : '2', unit: index === 0 ? 'jars' : 'items', dimension: 'PHYSICAL_COUNT',
        origin: index === 2 ? 'OWNER_DECLARED' : 'SOURCE_STATED', literal: index === 2 ? '3 items' : '2 items', binding: placeholder },
        compositionState: 'HOMOGENEOUS', linkage: 'MATCHED', binding: placeholder, components: [] },
      netMass: { quantity: index === 0 ? { state: 'EXACT', value: '500', unit: 'g', dimension: 'MASS', origin: 'SOURCE_STATED', literal: '500 g', binding: placeholder }
        : { state: 'MISSING', value: null, unit: null, dimension: 'MASS', origin: 'UNKNOWN', literal: null, binding: null },
        basis: index === 0 ? 'PER_ITEM' : 'UNKNOWN', linkage: index === 0 ? 'MATCHED' : 'UNKNOWN', basisBinding: index === 0 ? placeholder : null },
      drainedMass: { quantity: { state: 'MISSING', value: null, unit: null, dimension: 'MASS', origin: 'UNKNOWN', literal: null, binding: null },
        basis: 'UNKNOWN', linkage: 'UNKNOWN', basisBinding: null },
      selectedMassBases: index === 0 ? ['NET'] : [], massSelectionBinding: index === 0 ? placeholder : null,
    }));
    const raw = source('quotes.json', Buffer.from(rawDuplicate ? '{"quotes":[],"quotes":' + JSON.stringify(quotes.map(payload)) + '}' : canonicalJson({ quotes: quotes.map(payload) })));
    const declaration = source('declaration.json', Buffer.from(canonicalJson({ pack: { count: payload(quotes[2]!.pack.count) } })), 'OWNER_DECLARATION');
    quotes.forEach((quote, index) => {
      const p = `/quotes/${index}`;
      quote.source = ref(raw, p); quote.identity.binding = ref(raw, p + '/identity'); quote.price.binding = ref(raw, p + '/price');
      quote.price.conditions[0]!.binding = ref(raw, p + '/price/conditions/0'); quote.pack.binding = ref(raw, p + '/pack');
      quote.pack.count.binding = index === 2 ? ref(declaration, '/pack/count') : ref(raw, p + '/pack/count');
      if (index === 0) { quote.netMass.basisBinding = ref(raw, p + '/netMass'); quote.netMass.quantity.binding = ref(raw, p + '/netMass/quantity'); quote.massSelectionBinding = ref(raw, p + '/selectedMassBases'); }
    });
    const descriptor: Descriptor = { contractVersion: '1.0.0', sources: [schema, configuration, raw, declaration],
      configuration: { parserProfileId: 'generic-quote-unit-v1', parserRevision: '1.0.0', parserProfileSha256: schema.sha256,
        parserProfileRef: ref(schema, '/$id'), mappingRevision: 'literal-structured-quote-v1', configurationRef: ref(configuration, '/mappingRevision') }, quotes };
    mutate?.(descriptor);
    const descriptorPath = 'methods/quotes.json';
    source(descriptorPath, Buffer.from(canonicalJson(descriptor)));
    const receipt = await packages.intake({ contractVersion: '1.0.0', packageKey: `synthetic:quote-${randomUUID()}`, version: 1,
      sourceLabel: 'Synthetic quote fixture', sourceAcquiredAt: null, files: files.map(({ bytes: _bytes, ...file }) => file) }, new Map(files.map(file => [file.path, file.bytes])));
    return { selection: { decision: 'USE_PACKAGE' as const, packageId: receipt.packageId, manifestArtifactSha256: receipt.manifestArtifactSha256,
      packageContentSha256: receipt.packageContentSha256, descriptorPath }, rawDigest: raw.sha256 };
  };
  const valid = await intake();
  const request = { contractVersion: 'automation-quote-report-revision-v1', requestKey: randomUUID(), previousPairId: original.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, quoteMethods: valid.selection };
  const changes = () => db.prepare('SELECT total_changes() n').get();
  const invalid = [
    [await intake(d => { d.quotes[0]!.price.value = '1'; }), /QUOTE_METHOD_BINDING_VALUE_MISMATCH/],
    [await intake(d => { d.quotes[0]!.pack.count.binding = { ...d.quotes[0]!.source, fieldPointer: '/missing', locator: 'quotes.json/missing' }; }), /QUOTE_METHOD_BINDING_FIELD_MISMATCH/],
    [await intake(d => { d.configuration.mappingRevision = 'unreviewed-parser'; }), /QUOTE_METHOD_UNSUPPORTED_MAPPING_PROFILE/],
    [await intake(undefined, true), /QUOTE_METHOD_DUPLICATE_JSON_KEY/],
  ] as const;
  for (const [item, reason] of invalid) {
    const before = changes();
    await assert.rejects(service.requestReportRevision(workspaceId, runId, { ...request, requestKey: randomUUID(), quoteMethods: item.selection }), reason);
    assert.deepEqual(changes(), before, 'invalid quote package cannot enqueue or register report artifacts');
  }
  await service.requestReportRevision(workspaceId, runId, request);
  const beforeRetry = changes();
  assert.equal((await service.requestReportRevision(workspaceId, runId, request)).exactRetry, true);
  assert.deepEqual(changes(), beforeRetry);
  await service.processNext();
  const pair = (await service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.notEqual(pair.pairId, original.pairId);
  const report = await service.readReport(workspaceId, runId, 'MARKET', false, pair.pairId);
  const semantic = JSON.parse((await artifacts.read(report.versionId)).toString());
  const snapshot = semantic.quoteMethods as AutomationQuoteMethodSnapshot;
  assert.deepEqual(snapshot.selection, valid.selection);
  assert.equal(snapshot.output.quotes[0]!.pricePerPhysicalItem.display, '30000.00');
  assert.equal(snapshot.output.quotes[0]!.pricePer100gNet.display, '6000.00');
  assert.equal(snapshot.output.quotes[1]!.pricePerPhysicalItem.display, '120000.00');
  assert.equal(snapshot.output.quotes[1]!.pricePer100gNet.status, 'UNAVAILABLE');
  assert.deepEqual(snapshot.output.quotes[2]!.pricePerPhysicalItem.exact, { numerator: '100', denominator: '3' });
  assert.equal(snapshot.output.quotes[2]!.pricePerPhysicalItem.basis, 'SCENARIO');
  assert.equal(snapshot.output.quotes[3]!.pricePerPurchasedPack.status, 'UNAVAILABLE');
  assert.equal(semantic.completion.completedAnalyticalSections, 0);
  assert.ok(semantic.completion.boundedMethodOutputSectionIds.includes('M08'));
  const doc = new JSDOM(report.bytes.toString()).window.document;
  assert.match(doc.querySelector('#M08')!.textContent!, /30000.00 VND/);
  assert.match(doc.querySelector('#M08')!.textContent!, /Requires voucher/);
  assert.match(doc.querySelector('#M08')!.textContent!, /synthetic/);
  assert.match(doc.querySelector('#M08')!.textContent!, /Kịch bản dùng mẫu số người dùng khai báo/);
  assert.ok(doc.querySelector('#M08 a[href="#quote-method-evidence"]'));
  assert.equal(doc.querySelectorAll('script').length, 0);
  assert.deepEqual(JSON.parse(doc.querySelector('#quote-method-evidence pre')!.textContent!), snapshot);
  assert.deepEqual((await service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId)).bytes, originalInsight);
  await service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId, sources: request.sources });
  await service.processNext();
  const kept = (await service.listReportVersions(workspaceId, runId)).at(-1)!;
  const keptReport = await service.readReport(workspaceId, runId, 'MARKET', false, kept.pairId);
  assert.deepEqual(JSON.parse((await artifacts.read(keptReport.versionId)).toString()).quoteMethods, snapshot);
  await service.requestReportRevision(workspaceId, runId, { ...request, requestKey: randomUUID(), previousPairId: kept.pairId, quoteMethods: { decision: 'SKIP' } });
  await service.processNext();
  const skipped = (await service.listReportVersions(workspaceId, runId)).at(-1)!;
  const skippedReport = await service.readReport(workspaceId, runId, 'MARKET', false, skipped.pairId);
  assert.equal(JSON.parse((await artifacts.read(skippedReport.versionId)).toString()).quoteMethods, undefined);
  assert.deepEqual((await service.readReport(workspaceId, runId, 'MARKET')).bytes, originalMarket);
  const frozenChanges = changes();
  assert.equal((await service.requestReportRevision(workspaceId, runId, request)).exactRetry, true);
  assert.deepEqual(changes(), frozenChanges);
  db.pragma('query_only=ON');
  const reader = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now: () => { throw new Error('No clock on replay'); } });
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'MARKET', false, pair.pairId)).bytes, report.bytes);
  const originalSource = await artifacts.read(valid.rawDigest);
  await fs.writeFile(artifacts.pathForDigest(valid.rawDigest), Buffer.from('corrupt synthetic source'));
  await assert.rejects(reader.readReport(workspaceId, runId, 'MARKET', false, pair.pairId), /Quote method snapshot failed source replay/);
  await fs.writeFile(artifacts.pathForDigest(valid.rawDigest), originalSource);
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'MARKET', false, pair.pairId)).bytes, report.bytes);
  assert.deepEqual(changes(), frozenChanges);
});
