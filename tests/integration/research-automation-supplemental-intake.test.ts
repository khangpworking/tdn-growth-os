import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageRequestConflictError, SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { AutomationSupplementalSourceIntake, SUPPLEMENTAL_CONTEXT_PATH } from '../../src/modules/analysis/research-automation/supplemental-source-intake.js';
import { PreparedSupplementalSourceError, readPreparedSupplementalSources } from '../../src/modules/analysis/research-automation/supplemental-source-inventory.js';
import { buildAutomationQuoteMethods } from '../../src/modules/analysis/research-automation/quote-methods.js';
import { buildAutomationBoundedMethods } from '../../src/modules/analysis/research-automation/bounded-methods.js';
import type { ScopeSnapshot, StartSnapshot } from '../../src/modules/analysis/research-automation/model.js';
import { reportMethodPacketsFixture } from '../helpers/report-method-packets-fixture.js';
import type { GenericQuoteUnit } from '../../contracts/analysis/generic-quote-unit.generated.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date('2026-10-04T00:00:00.000Z');
type Quote = GenericQuoteUnit['input']['quotes'][number];
type Descriptor = Omit<GenericQuoteUnit['input'], 'sourcePackage'>;
type Upload = { family: 'QUOTE' | 'BOUNDED'; descriptorPath: string; files: { path: string; mediaType: string; bytes: Buffer }[] };
const payload = (value: unknown): unknown => Array.isArray(value) ? value.map(payload)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['source', 'binding', 'basisBinding', 'checkoutBinding', 'massSelectionBinding'].includes(key))
    .map(([key, child]) => [key, payload(child)])) : value;

/** One synthetic literal-structured-quote-v1 listing: 60000 VND for 2 jars of 500 g net each. */
async function quoteUpload(): Promise<Upload & { descriptor: Descriptor }> {
  const files: Upload['files'] = [];
  const source = (logicalPath: string, bytes: Buffer) => {
    files.push({ path: logicalPath, mediaType: 'application/json', bytes });
    return { logicalPath, sha256: sha(bytes), role: 'SOURCE' as const };
  };
  const schema = source('profiles/quote.json', await fs.readFile(new URL('../../contracts/analysis/generic-quote-unit.schema.json', import.meta.url)));
  const configuration = source('config/mapping.json', Buffer.from('{"mappingRevision":"literal-structured-quote-v1"}'));
  const ref = (file: typeof schema, fieldPointer: string) => ({ sourceSha256: file.sha256, locator: file.logicalPath + fieldPointer, fieldPointer });
  const placeholder = ref(schema, '/$id');
  const quote: Quote = {
    quoteId: 'synthetic-0', source: placeholder, acquiredAt: '2026-10-01T00:00:00Z', observedAt: null,
    authenticationState: 'UNKNOWN', reviewState: 'UNREVIEWED',
    identity: { state: 'EXACT', platform: 'synthetic', shopId: 'shop', listingId: 'listing-0', variantState: 'EXACT',
      variantId: 'variant-0', variantAttributes: [], binding: placeholder, linkage: 'MATCHED' },
    offerText: 'Synthetic jars', packText: 'Synthetic pack',
    price: { state: 'EXACT', value: '60000', range: null, currency: 'VND', priceState: 'PROMO_CONDITIONAL', binding: placeholder,
      checkoutBinding: null, conditions: [{ literal: 'Requires voucher', binding: placeholder }], tax: 'UNKNOWN', shipping: 'UNKNOWN' },
    pack: { count: { state: 'EXACT', value: '2', unit: 'jars', dimension: 'PHYSICAL_COUNT', origin: 'SOURCE_STATED', literal: '2 jars', binding: placeholder },
      compositionState: 'HOMOGENEOUS', linkage: 'MATCHED', binding: placeholder, components: [] },
    netMass: { quantity: { state: 'EXACT', value: '500', unit: 'g', dimension: 'MASS', origin: 'SOURCE_STATED', literal: '500 g', binding: placeholder },
      basis: 'PER_ITEM', linkage: 'MATCHED', basisBinding: placeholder },
    drainedMass: { quantity: { state: 'MISSING', value: null, unit: null, dimension: 'MASS', origin: 'UNKNOWN', literal: null, binding: null },
      basis: 'UNKNOWN', linkage: 'UNKNOWN', basisBinding: null },
    selectedMassBases: ['NET'], massSelectionBinding: placeholder,
  };
  const raw = source('quotes.json', Buffer.from(canonicalJson({ quotes: [payload(quote)] })));
  const p = '/quotes/0';
  quote.source = ref(raw, p); quote.identity.binding = ref(raw, `${p}/identity`); quote.price.binding = ref(raw, `${p}/price`);
  quote.price.conditions[0]!.binding = ref(raw, `${p}/price/conditions/0`); quote.pack.binding = ref(raw, `${p}/pack`);
  quote.pack.count.binding = ref(raw, `${p}/pack/count`); quote.netMass.basisBinding = ref(raw, `${p}/netMass`);
  quote.netMass.quantity.binding = ref(raw, `${p}/netMass/quantity`); quote.massSelectionBinding = ref(raw, `${p}/selectedMassBases`);
  const descriptor: Descriptor = { contractVersion: '1.0.0', sources: [schema, configuration, raw],
    configuration: { parserProfileId: 'generic-quote-unit-v1', parserRevision: '1.0.0', parserProfileSha256: schema.sha256,
      parserProfileRef: ref(schema, '/$id'), mappingRevision: 'literal-structured-quote-v1', configurationRef: ref(configuration, '/mappingRevision') }, quotes: [quote] };
  files.push({ path: 'methods/quotes.json', mediaType: 'application/json', bytes: Buffer.from(canonicalJson(descriptor)) });
  return { family: 'QUOTE', descriptorPath: 'methods/quotes.json', files, descriptor };
}

/** Gates-only ReportMethodPacketsInput with its JSON source and the two adopted Markdown method authorities. */
function boundedUpload(): Upload {
  const fixture = reportMethodPacketsFixture();
  const descriptor = { ...structuredClone(fixture.descriptor), decisions: null };
  const kept = fixture.files.filter(file => [fixture.gateSourcePath, 'method-packets/advanced-profile.md', 'method-packets/adoption.md'].includes(file.path));
  return { family: 'BOUNDED', descriptorPath: fixture.logicalPath, files: [
    ...kept.map(file => ({ path: file.path, mediaType: file.mediaType, bytes: file.bytes })),
    { path: fixture.logicalPath, mediaType: 'application/json', bytes: Buffer.from(canonicalJson(descriptor)) },
  ] };
}

function request(upload: Upload, requestKey: string, overrides: Record<string, unknown> = {}) {
  return { contractVersion: 'automation-supplemental-prepare-v1', requestKey, family: upload.family, sourceLabel: 'Synthetic supplemental source',
    acquiredAt: '2026-10-01T00:00:00.000Z', descriptorPath: upload.descriptorPath,
    files: upload.files.map(file => ({ path: file.path, mediaType: file.mediaType, representationRole: 'structured' })), ...overrides };
}
const bytesOf = (upload: Upload) => new Map(upload.files.map(file => [file.path, file.bytes]));

// Owner boundary: the prepare path stores, binds and publishes; the unchanged method owners then read the
// stored package back through the ordinary Foundation reader on a plain (canonical-only) artifact store, and the
// reload inventory recovers exactly the verified prepared packages of one run from that reader alone.
test('supplemental quote and bounded packages are prepared run-bound, reloadable, and usable only through explicit owner replay', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-supplemental-intake-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifactRoot = path.join(root, 'artifacts');
  const intake = new AutomationSupplementalSourceIntake(new RequestScopedArtifactStore(artifactRoot), db, now);
  const workspaceId = randomUUID(), runId = randomUUID();
  const start: StartSnapshot = { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY',
    keyword: 'synthetic supplement', description: null, interview: null,
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-09-30', dayCount: 273 }, reports: ['MARKET', 'INSIGHT'] };
  const runBound = (id: string): { runId: string; start: StartSnapshot; scope: ScopeSnapshot } => ({ runId: id, start, scope: {
    contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId: id, definition: 'Synthetic only',
    includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] } });
  const bound = runBound(runId);
  const changes = () => db.prepare('SELECT total_changes() n').get();
  const canonicalFiles = async () => (await fs.readdir(artifactRoot, { recursive: true }).catch(() => [] as string[]))
    .filter(name => !name.startsWith('.owner-api-requests')).sort();
  const reader = new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: new ContentAddressedArtifactStore(artifactRoot) }));
  const replayBinding = { workspaceId, runId, startSha256: 'a'.repeat(64), scopeSha256: 'b'.repeat(64), previousPairId: 'c'.repeat(64) };
  const quote = await quoteUpload(), bounded = boundedUpload();

  // Malformed or unusable input is rejected before any database row or canonical artifact exists.
  const markdownQuote = { ...quote, files: [...quote.files, { path: 'notes.md', mediaType: 'text/markdown', bytes: Buffer.from('# note') }] };
  const impersonated = { ...quote, files: [...quote.files, { path: SUPPLEMENTAL_CONTEXT_PATH, mediaType: 'application/json', bytes: Buffer.from('{}') }] };
  const authoredIdentity = { ...quote, files: quote.files.map(file => file.path !== quote.descriptorPath ? file
    : { ...file, bytes: Buffer.from(canonicalJson({ ...quote.descriptor, sourcePackage: { packageId: randomUUID() } })) }) };
  const brokenSource = { ...quote, files: quote.files.map(file => file.path === 'quotes.json' ? { ...file, bytes: Buffer.from('{"quotes":[') } : file) };
  const unusedFile = { ...quote, files: [...quote.files, { path: 'extra.json', mediaType: 'application/json', bytes: Buffer.from('{}') }] };
  const strayMarkdown = { ...bounded, files: [...bounded.files, { path: 'method-packets/other.md', mediaType: 'text/markdown', bytes: Buffer.from('# other') }] };
  // Includes the synthesis authority so the rejection comes from decision admission, not a missing file.
  const decisionFixture = reportMethodPacketsFixture();
  const synthesis = decisionFixture.files.find(file => file.path === 'method-packets/synthesis-ai-profile.md')!;
  const withDecisions = { ...bounded, files: [...bounded.files.map(file => file.path !== bounded.descriptorPath ? file
    : { ...file, bytes: Buffer.from(canonicalJson(decisionFixture.descriptor)) }), { path: synthesis.path, mediaType: synthesis.mediaType, bytes: synthesis.bytes }] };
  const driftedLiteral = { ...quote, files: quote.files.map(file => file.path !== quote.descriptorPath ? file
    : { ...file, bytes: Buffer.from(canonicalJson({ ...quote.descriptor, quotes: [{ ...quote.descriptor.quotes[0]!, price: { ...quote.descriptor.quotes[0]!.price, value: '1' } }] })) }) };
  const quoteMap = bytesOf(quote);
  const rejected: [unknown, Map<string, Buffer>, RegExp][] = [
    [{ ...request(quote, randomUUID()), sourcePackage: {} }, quoteMap, /REQUEST_INVALID/],
    [request(quote, randomUUID(), { acquiredAt: 'yesterday' }), quoteMap, /REQUEST_INVALID/],
    [request(quote, randomUUID(), { files: [...request(quote, '').files, { path: '../escape.json', mediaType: 'application/json', representationRole: 'structured' }] }), quoteMap, /REQUEST_INVALID/],
    [request(quote, randomUUID(), { files: [...request(quote, '').files, { path: 'a/./b.json', mediaType: 'application/json', representationRole: 'structured' }] }), quoteMap, /UNSAFE_PATH/],
    [request(quote, randomUUID(), { files: [...request(quote, '').files, request(quote, '').files[0]] }), quoteMap, /DUPLICATE_PATH/],
    [request(impersonated, randomUUID()), bytesOf(impersonated), /RESERVED_PATH/],
    [request(quote, randomUUID(), { descriptorPath: 'missing.json' }), quoteMap, /DESCRIPTOR_NOT_INCLUDED/],
    [request(markdownQuote, randomUUID()), bytesOf(markdownQuote), /UNSUPPORTED_MEDIA_TYPE/],
    [request(quote, randomUUID()), new Map([...quoteMap].slice(1)), /MEMBERSHIP_MISMATCH/],
    [request(quote, randomUUID()), new Map<string, Buffer>([...quoteMap, ['extra.json', Buffer.from('{}')]]), /MEMBERSHIP_MISMATCH/],
    [request(quote, randomUUID()), new Map([...quoteMap].map(([key, value]) => [key, key === 'quotes.json' ? Buffer.alloc(8 * 1024 * 1024 + 1) : value] as const)), /FILE_SIZE_LIMIT/],
    [request(brokenSource, randomUUID()), bytesOf(brokenSource), /MALFORMED_JSON/],
    [request(authoredIdentity, randomUUID()), bytesOf(authoredIdentity), /DESCRIPTOR_AUTHORED_PACKAGE_IDENTITY/],
    [request(driftedLiteral, randomUUID()), bytesOf(driftedLiteral), /METHOD_PREFLIGHT_REJECTED:QUOTE_METHOD_BINDING_VALUE_MISMATCH/],
    [request(unusedFile, randomUUID()), bytesOf(unusedFile), /UNCONSUMED_FILE/],
    [request(strayMarkdown, randomUUID()), bytesOf(strayMarkdown), /UNCONSUMED_FILE/],
    [request(withDecisions, randomUUID()), bytesOf(withDecisions), /METHOD_PREFLIGHT_REJECTED:BOUNDED_METHOD_DECISIONS_NOT_ADMITTED/],
  ];
  const initial = changes();
  for (const [input, supplied, reason] of rejected) {
    await assert.rejects(intake.prepare(input, supplied, bound), reason);
    assert.deepEqual(changes(), initial, `${reason} must reject before any database mutation`);
    assert.deepEqual(await canonicalFiles(), [], `${reason} must reject before any artifact write`);
  }
  assert.deepEqual((await readPreparedSupplementalSources(reader, bound)).packages, []);

  const receipts: Awaited<ReturnType<typeof intake.prepare>>[] = [];
  for (const upload of [quote, bounded]) {
    const requestKey = randomUUID();
    // Bytes are snapshotted before the asynchronous owner preflight: later caller mutation cannot change what is stored.
    const supplied = new Map([...bytesOf(upload)].map(([key, bytes]) => [key, Buffer.from(bytes)]));
    const pending = intake.prepare(request(upload, requestKey), supplied, bound);
    for (const bytes of supplied.values()) bytes.fill(0x20);
    const receipt = await pending;
    receipts.push(receipt);
    assert.equal(receipt.state, 'PREPARED_NOT_ADMITTED');
    assert.equal(receipt.admission, 'SEMANTIC_REPLAY_REQUIRED_AT_REVISION');
    assert.equal(receipt.provenance, 'OPERATOR_SUPPLIED_UNVERIFIED');
    assert.equal(receipt.exactRetry, false);
    assert.deepEqual(receipt.files.map(file => [file.path, file.sha256, file.byteSize]).sort(),
      upload.files.map(file => [file.path, sha(file.bytes), file.bytes.length]).sort());

    const stored = await reader.readFinalizedSourcePackage(receipt.packageId);
    assert.equal(stored.manifestArtifactSha256, receipt.manifestArtifactSha256);
    assert.ok(stored.files.every(file => file.providerProvenance === 'operator_supplied_unverified' && file.independence === 'non_independent'));
    assert.equal(stored.manifest.sourceAcquiredAt, '2026-10-01T00:00:00.000Z');
    assert.equal((await reader.readAutomationAttachmentOrigin(receipt.packageId))?.bindingSha256, sha(Buffer.from(canonicalJson(bound))));
    // The server context is the only stored member beyond the uploaded ones, and it binds this exact request and run.
    assert.deepEqual(stored.files.map(file => file.path).filter(file => !receipt.files.some(member => member.path === file)), [SUPPLEMENTAL_CONTEXT_PATH]);
    const context = JSON.parse(stored.files.find(file => file.path === SUPPLEMENTAL_CONTEXT_PATH)!.bytes.toString('utf8'));
    assert.deepEqual([context.runId, context.workspaceId, context.request.requestKey, context.request.family, context.request.descriptorPath],
      [runId, workspaceId, requestKey, upload.family, upload.descriptorPath]);
    // A supplemental package must never appear in this run's prepared Metric source list.
    assert.deepEqual(await reader.findAutomationAttachmentPackagesByKeyPrefix(`automation-upload:${runId}-`), []);

    const selection = { decision: 'USE_PACKAGE' as const, packageId: receipt.packageId, manifestArtifactSha256: receipt.manifestArtifactSha256,
      packageContentSha256: receipt.packageContentSha256, descriptorPath: receipt.descriptorPath };
    if (upload.family === 'QUOTE') {
      const snapshot = await buildAutomationQuoteMethods(selection, replayBinding, reader);
      assert.equal(snapshot.output.quotes[0]!.pricePerPhysicalItem.display, '30000.00');
      assert.equal(snapshot.output.quotes[0]!.pricePer100gNet.display, '6000.00');
    } else {
      assert.deepEqual((await buildAutomationBoundedMethods(selection, replayBinding, reader)).selection, selection);
    }

    // Exact replay, with equivalent file declarations reordered, is deduplicated without any database or artifact mutation.
    const [beforeChanges, beforeFiles] = [changes(), await canonicalFiles()];
    const reordered = request(upload, requestKey, { files: [...request(upload, requestKey).files].reverse() });
    assert.deepEqual(await intake.prepare(reordered, new Map([...bytesOf(upload)].reverse()), bound), { ...receipt, exactRetry: true });
    assert.deepEqual([changes(), await canonicalFiles()], [beforeChanges, beforeFiles]);
    assert.equal(intake.hasRequest(runId, upload.family, requestKey), true);

    // Same request identity with changed bytes or semantic request metadata conflicts and changes nothing.
    const reformatted = { ...upload, files: upload.files.map(file => file.path !== upload.descriptorPath ? file
      : { ...file, bytes: Buffer.from(JSON.stringify(JSON.parse(file.bytes.toString('utf8')), null, 2)) }) };
    const recast = request(upload, requestKey);
    recast.files[0]!.representationRole = 'primary';
    for (const [input, supplied] of [[request(reformatted, requestKey), bytesOf(reformatted)],
      [request(upload, requestKey, { sourceLabel: 'Relabelled source' }), bytesOf(upload)],
      [request(upload, requestKey, { acquiredAt: null }), bytesOf(upload)],
      [recast, bytesOf(upload)]] as const) {
      await assert.rejects(intake.prepare(input, supplied, bound), SourcePackageRequestConflictError);
      assert.deepEqual([changes(), await canonicalFiles()], [beforeChanges, beforeFiles]);
    }
    // Re-pointing the descriptor under the same identity can never return the stored receipt: every uploaded file must
    // be consumed, so the remaining JSON members cannot form another valid descriptor for this exact membership.
    const repointed = upload.files.find(file => file.path !== upload.descriptorPath && file.mediaType === 'application/json')!.path;
    await assert.rejects(intake.prepare(request(upload, requestKey, { descriptorPath: repointed }), bytesOf(upload), bound), /METHOD_PREFLIGHT_REJECTED:/);
    assert.deepEqual([changes(), await canonicalFiles()], [beforeChanges, beforeFiles]);
  }

  // Browser reload: a fresh read through the Foundation reader alone recovers both prepared packages with the exact
  // receipt identity, still PREPARED_NOT_ADMITTED. Another run's packages are never listed.
  const otherRun = runBound(randomUUID());
  const otherReceipt = await intake.prepare(request(quote, randomUUID()), bytesOf(quote), otherRun);
  const entry = ({ contractVersion: _version, exactRetry: _retry, ...rest }: (typeof receipts)[number]) => rest;
  const byPackage = (a: { packageId: string }, b: { packageId: string }) => a.packageId < b.packageId ? -1 : 1;
  const reloaded = await readPreparedSupplementalSources(reader, bound);
  assert.deepEqual({ ...reloaded, packages: [...reloaded.packages].sort(byPackage) },
    { contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId, runId, packages: receipts.map(entry).sort(byPackage) });
  assert.deepEqual((await readPreparedSupplementalSources(reader, otherRun)).packages, [entry(otherReceipt)]);

  // Tamper: packages written under a run's prefix by another Foundation writer fail the whole read closed unless they
  // are exactly server form. The unchanged control proves the forger reproduces preparation, so each failure is the change.
  const genuine = await reader.readFinalizedSourcePackage(receipts[0]!.packageId);
  const genuineContext = JSON.parse(genuine.files.find(file => file.path === SUPPLEMENTAL_CONTEXT_PATH)!.bytes.toString('utf8'));
  const forgeStore = new RequestScopedArtifactStore(artifactRoot);
  const writer = new SourcePackageService({ db, artifactStore: forgeStore, now });
  type Member = Omit<(typeof genuine.files)[number], 'bytes'> & { bytes: Buffer };
  async function forge(change: { context?: (value: any) => unknown; contextText?: (value: any) => string; members?: (members: Member[]) => Member[]; originRun?: string }) {
    const target = runBound(randomUUID()), requestKey = randomUUID();
    const value = { ...genuineContext, runId: target.runId, runBindingSha256: sha(Buffer.from(canonicalJson(target))), request: { ...genuineContext.request, requestKey } };
    const contextValue = change.context ? change.context(value) : value;
    const contextBytes = Buffer.from(change.contextText ? change.contextText(contextValue) : canonicalJson(contextValue));
    let members: Member[] = genuine.files.map(file => ({ ...file, evidenceFamily: `supplemental-quote-${target.runId}`,
      ...(file.path === SUPPLEMENTAL_CONTEXT_PATH ? { bytes: contextBytes, sha256: sha(contextBytes), byteSize: contextBytes.length } : {}) }));
    if (change.members) members = change.members(members);
    await forgeStore.withOwnership(async () => {
      const stored = await writer.intakeAutomationAttachment({ contractVersion: '1.0.0', packageKey: `automation-supplemental:${target.runId}-quote-${requestKey}`,
        version: 1, sourceLabel: genuine.manifest.sourceLabel, sourceAcquiredAt: genuine.manifest.sourceAcquiredAt,
        files: members.map(({ bytes: _bytes, ...file }) => file) }, new Map(members.map(file => [file.path, file.bytes])),
      sha(Buffer.from(canonicalJson(change.originRun ? runBound(change.originRun) : target))));
      const verified = await writer.readVerified(stored.packageId);
      for (const digest of new Set([verified.manifestArtifactSha256, ...verified.files.map(file => file.sha256)])) await forgeStore.publishOwned(digest);
    });
    return target;
  }
  assert.equal((await readPreparedSupplementalSources(reader, await forge({}))).packages.length, 1);
  const tampered: [Parameters<typeof forge>[0], string][] = [
    [{ members: members => members.filter(file => file.path !== SUPPLEMENTAL_CONTEXT_PATH) }, 'CONTEXT_MISSING'],
    [{ context: value => ({ ...value, admitted: true }) }, 'CONTEXT_INVALID'],
    [{ contextText: value => JSON.stringify(value, null, 2) }, 'CONTEXT_INVALID'],
    [{ context: value => ({ ...value, request: { ...value.request, files: [...value.request.files].reverse() } }) }, 'CONTEXT_INVALID'],
    [{ context: value => ({ ...value, runId: otherRun.runId }) }, 'CONTEXT_RUN_MISMATCH'],
    [{ context: value => ({ ...value, request: { ...value.request, requestKey: randomUUID() } }) }, 'CONTEXT_REQUEST_MISMATCH'],
    [{ context: value => ({ ...value, request: { ...value.request, sourceLabel: 'Other label' } }) }, 'CONTEXT_REQUEST_MISMATCH'],
    [{ originRun: otherRun.runId }, 'ORIGIN_BINDING_MISMATCH'],
    [{ members: members => members.map(file => file.path === 'quotes.json' ? { ...file, providerProvenance: 'verified' as const } : file) }, 'MEMBER_METADATA_MISMATCH'],
    [{ members: members => [...members, { ...members[0]!, path: 'undeclared.json', bytes: Buffer.from('{}'), sha256: sha(Buffer.from('{}')), byteSize: 2 }] }, 'MEMBER_METADATA_MISMATCH'],
  ];
  for (const [change, code] of tampered) {
    const target = await forge(change);
    await assert.rejects(readPreparedSupplementalSources(reader, target), (error: unknown) =>
      error instanceof PreparedSupplementalSourceError && error.code === code, code);
  }
  // Forged packages under other runs' prefixes never leak into, or break, this run's inventory.
  assert.equal((await readPreparedSupplementalSources(reader, bound)).packages.length, 2);
});
