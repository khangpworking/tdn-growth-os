import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { AttributedMarketEvent, DescriptiveMarketMethods, LiteralMarketObservation, MarketObservationScope } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { buildVerifiedReportDescriptiveExtension } from '../report-descriptive-extension.js';
import { verifyDescriptiveMarketSnapshot } from '../descriptive-market-methods.js';
import { MAX_CAPTURE_ENVELOPE_BYTES, MAX_JSON_ARTIFACT_BYTES, ResearchAutomationIntegrityError, type CaptureRecord, type ScopeSnapshot, type StartSnapshot, type StepResultDocument } from './model.js';
import { verifyAutomationDetailCaptures, verifyAutomationObservations } from './verified-observations.js';

const DESCRIPTOR = 'methods/descriptive-input.json';
const PROFILE = 'authority/market-profile.md';
const ADOPTION = 'authority/method-adoption.md';
const NORMALIZED = 'normalized/observations.json';
const CONFIGURATION = 'normalized/run-configuration.json';
const MAPPING_REVISION = 'kalodata-product-detail-descriptive-v2';
const PROFILE_SHA = 'ddd4c0dcebc9a07a215646abce5152060f7d0c45c2582676ef84e2eb1ae3d8f7';
const ADOPTION_SHA = '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
const READ_BUDGET = { maxFileBytes: MAX_CAPTURE_ENVELOPE_BYTES, maxTotalBytes: 128 * 1024 * 1024 };
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));

interface BridgeInput {
  readonly runId: string;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
}
interface Prepared {
  readonly request: SourcePackageIntakeRequest;
  readonly files: ReadonlyMap<string, Buffer>;
}
type Input = DescriptiveMarketMethods['input'];
type Literal = Omit<LiteralMarketObservation, 'source' | 'aggregation'>;

/** Real Foundation intake and exact descriptive-method execution; never a synthetic Metric envelope. */
export class AutomationDescriptiveMethodBridge {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #packages: SourcePackageService;

  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#packages = new SourcePackageService(options);
  }

  async execute(input: BridgeInput, signal?: AbortSignal): Promise<DescriptiveMarketMethods | undefined> {
    const prepared = await this.#prepare(input);
    if (!prepared) return undefined;
    return withDatabaseMutationMutex(this.#db, async () => {
      signal?.throwIfAborted();
      const receipt = await this.#packages.intake(prepared.request, prepared.files);
      const retained = await this.#packages.readVerified(receipt.packageId, READ_BUDGET);
      this.#verifyPrepared(prepared, retained);
      signal?.throwIfAborted();
      return buildVerifiedReportDescriptiveExtension(DESCRIPTOR, retained).output;
    });
  }

  /** Read a committed snapshot, not a fresh calculation under today's code or adoption. */
  async verify(untrusted: unknown, input: BridgeInput): Promise<DescriptiveMarketMethods> {
    const output = verifyDescriptiveMarketSnapshot(untrusted);
    const retained = await this.#packages.readVerified(output.input.sourcePackage.packageId, READ_BUDGET);
    const identity = output.input.sourcePackage;
    if (retained.manifestArtifactSha256 !== identity.manifestArtifactSha256 || retained.packageContentSha256 !== identity.packageContentSha256 ||
        retained.manifest.version !== identity.version)
      throw new ResearchAutomationIntegrityError('Retained method package identity differs from the frozen run.');
    const files = new Map(retained.files.map(file => [file.path, file]));
    const parse = (filePath: string): Record<string, unknown> => {
      const file = files.get(filePath);
      if (!file || file.mediaType !== 'application/json' || file.byteSize > MAX_JSON_ARTIFACT_BYTES)
        throw new ResearchAutomationIntegrityError('Retained method declaration is missing.');
      try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
        return value as Record<string, unknown>;
      } catch { throw new ResearchAutomationIntegrityError('Retained method declaration is invalid.'); }
    };
    const { sourcePackage: _package, ...descriptor } = output.input;
    if (canonicalJson(parse(DESCRIPTOR)) !== canonicalJson(descriptor))
      throw new ResearchAutomationIntegrityError('Retained method input differs from its committed descriptor.');
    const normalized = parse(NORMALIZED);
    // Mapping v2 adds located source date statements. Frozen v1 remains readable
    // without rerunning either mapping or replacing its original package identity.
    const revision = normalized.mappingRevision === 'kalodata-product-detail-descriptive-v1' ? 'v1'
      : normalized.mappingRevision === 'kalodata-product-detail-descriptive-v2' ? 'v2' : null;
    if (!revision || retained.manifest.packageKey !== `automation-method:${input.runId}-descriptive-${revision}` ||
        normalized.contractVersion !== `automation-descriptive-normalization-${revision}` ||
        normalized.runId !== input.runId || canonicalJson(normalized.start) !== canonicalJson(input.start) || canonicalJson(normalized.scope) !== canonicalJson(input.scope))
      throw new ResearchAutomationIntegrityError('Retained method normalization differs from the frozen run.');
    // Authority and inputs are bound to the recorded snapshot, never current adoption constants.
    if (files.get(PROFILE)?.sha256 !== output.input.configuration.profileSha256 || files.get(ADOPTION)?.sha256 !== output.input.configuration.adoptionSha256)
      throw new ResearchAutomationIntegrityError('Retained method authority differs from the committed snapshot.');
    for (const source of output.input.sources) {
      const file = files.get(source.logicalPath);
      if (!file || file.sha256 !== source.sha256 || file.evidenceFamily !== source.evidenceFamily || file.providerProvenance !== source.providerProvenance)
        throw new ResearchAutomationIntegrityError('Retained method source membership differs from its snapshot.');
    }
    const needed = new Set(input.collection?.comparables.map(row => row.captureIndex) ?? []);
    const captures = input.captures.filter(row => row.stepId === 'COLLECTION' && needed.has(row.ordinal));
    if (!needed.size || captures.length !== needed.size || retained.files.filter(file => file.path.startsWith('captures/')).length !== needed.size)
      throw new ResearchAutomationIntegrityError('Retained method capture inventory differs from the collection.');
    for (const capture of captures) {
      const file = files.get(`captures/collection-${capture.ordinal}.json`);
      if (!file || file.sha256 !== capture.artifactSha256 || file.mediaType !== capture.mediaType)
        throw new ResearchAutomationIntegrityError('Retained method capture differs from the collection.');
    }
    return output;
  }

  #verifyPrepared(prepared: Prepared, retained: VerifiedFinalizedSourcePackage): void {
    const { packageId: _id, finalizedAt: _time, packageContentSha256: _content, ...request } = retained.manifest;
    const sortedRequest = { ...prepared.request, files: [...prepared.request.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
    if (canonicalJson(request) !== canonicalJson(sortedRequest)) throw new ResearchAutomationIntegrityError('Automation method package differs from the frozen run.');
    for (const file of retained.files) {
      if (!prepared.files.get(file.path)?.equals(file.bytes)) throw new ResearchAutomationIntegrityError('Automation normalization differs from its raw captures.');
    }
  }

  async #prepare(input: BridgeInput): Promise<Prepared | undefined> {
    if (!input.collection?.comparables.length) return undefined;
    if (input.start.workspaceId !== input.scope.workspaceId || input.scope.runId !== input.runId || input.collection.runId !== input.runId)
      throw new ResearchAutomationIntegrityError('Automation method input identity mismatch.');
    const neededOrdinals = new Set(input.collection.comparables.map(value => value.captureIndex));
    const captures = input.captures.filter(value => value.stepId === 'COLLECTION' && neededOrdinals.has(value.ordinal));
    const captureBytes = new Map<string, Buffer>();
    let totalBytes = 0;
    for (const capture of captures) {
      const bytes = await this.#artifacts.read(capture.artifactSha256, { maxBytes: MAX_CAPTURE_ENVELOPE_BYTES });
      totalBytes += bytes.length;
      if (totalBytes > READ_BUDGET.maxTotalBytes - 4 * MAX_JSON_ARTIFACT_BYTES) throw new ResearchAutomationIntegrityError('Automation method evidence exceeds its bound.');
      captureBytes.set(capture.artifactSha256, bytes);
    }
    const observations = verifyAutomationObservations({ ...input, captureBytes });
    if (!observations.length) return undefined;
    const profile = await fs.readFile(new URL('../../../../docs/research/method-configurations-v1/market-profile.md', import.meta.url));
    const adoption = await fs.readFile(new URL('../../../../docs/research/method-configurations-v1-adoption.md', import.meta.url));
    if (!profile || !adoption) throw new ResearchAutomationIntegrityError('Retained method authority is missing.');
    if (sha(profile) !== PROFILE_SHA || sha(adoption) !== ADOPTION_SHA) throw new ResearchAutomationIntegrityError('Descriptive method authority bytes do not match the adopted revision.');

    // Query attribution is not verified category membership or an observed full market.
    const scope: MarketObservationScope = {
      universe: 'Chỉ gồm các bản ghi Kalodata của sản phẩm đã chọn trong lượt này; không đại diện toàn thị trường.',
      geography: 'Truy vấn Việt Nam (VN); từ chối phản hồi có quốc gia mâu thuẫn.',
      frame: 'Tập sản phẩm đã chọn, không phải mẫu đại diện; mã lượt nghiên cứu được giữ trong hồ sơ nguồn.',
      inclusionRule: 'Giữ đúng mã sản phẩm/đối chiếu trong phạm vi đã xác nhận; chưa phân loại CORE/WIDE.',
      exclusionRule: 'Chưa áp dụng bộ lọc ngữ nghĩa theo điều kiện bao gồm hoặc loại trừ.',
      variantRule: 'Giữ mã sản phẩm của nguồn; chưa hợp nhất listing hoặc chuẩn hóa biến thể.',
    };
    const literals: Literal[] = observations.map(value => ({
      sourceWording: value.sourceWording,
      entityLabel: value.entityLabel ?? value.evidence.providerProductId,
      measureLiteral: value.measureLiteral,
      measureDefinition: `Kalodata product/detail, trường ${value.measureLiteral}; giá trị nguồn tự báo, chưa xác minh độc lập.`,
      unit: value.comparable.metric === 'GMV_VND' ? 'VND' : 'đơn vị bán theo nguồn',
      period: {
        start: value.comparable.window.startDate, end: value.comparable.window.endDate, timezone: '+07:00',
        basis: 'Khoảng ngày đã truy vấn, gồm hai đầu mốc; +07:00 là quy ước hiển thị Việt Nam của ứng dụng. Chưa xác minh ranh giới ngày hoặc độ phủ của nguồn.',
      },
      scope,
      observation: { state: /^0(?:\.0+)?$/.test(value.comparable.value) ? 'observed_zero' : 'observed_value', value: value.comparable.value, precision: 'non_exact' },
    }));
    // One located product response per capture, not one listing per metric and not a unique entity count.
    const seenSupply = new Set<string>();
    const supply = observations.flatMap((value, index) => {
      if (seenSupply.has(value.evidence.captureSha256)) return [];
      seenSupply.add(value.evidence.captureSha256);
      return [{ observation: literals[index]!, objectLiteral: 'Bản ghi sản phẩm Kalodata', statusLiteral: null,
        dateMeaning: 'Kỳ truy vấn của thước đo, không phải khoảng ngày listing còn hàng hoặc đang bán.' }];
    });
    // Only already admitted detail captures: no new collection, inferred event,
    // name join, or interpretation of a query date as a product launch date.
    const events: Omit<AttributedMarketEvent, 'source' | 'targetLink' | 'conflictRefs'>[] = [];
    const eventLineage: { captures: { captureSha256: string; responseSha256: string; responseLocator: string;
      productRef: string; retrievedAt: string; requestWindow: CaptureRecord['window'] }[] }[] = [];
    const eventIndex = new Map<string, number>();
    for (const detail of verifyAutomationDetailCaptures({ ...input, captures, captureBytes })) {
      const value = detail.data.launch_date;
      if (typeof value !== 'string' || !/\S/.test(value)) continue;
      const sourceWording = JSON.stringify({ launch_date: value });
      if (sourceWording.length > 2000) throw new ResearchAutomationIntegrityError('Source date statement exceeds the descriptive method bound.');
      const identity = JSON.stringify([detail.productRef, value]);
      let index = eventIndex.get(identity);
      if (index === undefined) {
        index = events.length;
        eventIndex.set(identity, index);
        const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
        const eventDate = parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
        events.push({
          statementType: 'UNCLASSIFIED', sourceWording, attribution: 'Kalodata product/detail, trường launch_date; chưa xác minh độc lập.',
          publicationDate: null, eventDate,
          dateBasis: 'Ngày do nguồn khai báo tại launch_date, không phải ngày thu thập hoặc kỳ đo lường. Có thể nằm ngoài kỳ truy vấn; chưa xác minh đây là ngày ra mắt thực tế. Giá trị sai định dạng được giữ nguyên, không tự sửa.',
          namedScope: detail.productRef, affectedMetricLiteral: null,
        });
        eventLineage.push({ captures: [] });
      }
      eventLineage[index]!.captures.push({ captureSha256: detail.capture.artifactSha256,
        responseSha256: sha(detail.responseBytes), responseLocator: '/data/launch_date', productRef: detail.productRef,
        retrievedAt: detail.capture.retrievedAt, requestWindow: detail.capture.window });
    }
    const normalized = {
      contractVersion: 'automation-descriptive-normalization-v2', mappingRevision: MAPPING_REVISION, runId: input.runId,
      observations: literals, supply, events, eventLineage,
      lineage: observations.map(value => ({ ...value.evidence, mappingRevision: MAPPING_REVISION, productRef: value.comparable.productId, metric: value.comparable.metric })),
      start: input.start, scope: input.scope,
    };
    const normalizedBytes = json(normalized);
    const normalizedSha = sha(normalizedBytes);
    const configuration = {
      profileId: 'source-bound-descriptive-market-v1' as const, profileVersion: '1.0.0' as const,
      policyRevision: 'a41-adopted-automation-literal-inventory-v1', profileSha256: PROFILE_SHA, adoptionSha256: ADOPTION_SHA,
    };
    const question = input.scope.definition;
    const configurationBytes = json({ declaration: { configuration, question, scope } });
    const sourceRef = (locator: string) => ({ sourceSha256: normalizedSha, locator });
    const records: LiteralMarketObservation[] = literals.map((value, index) => ({ ...value, source: sourceRef(`/observations/${index}`), aggregation: null }));
    const descriptor: Omit<Input, 'sourcePackage'> = {
      contractVersion: '1.0.0',
      sources: [
        { logicalPath: NORMALIZED, sha256: normalizedSha, evidenceFamily: 'kalodata-automation', providerProvenance: 'provider_reported' },
        { logicalPath: CONFIGURATION, sha256: sha(configurationBytes), evidenceFamily: 'automation-method-configuration', providerProvenance: 'operator_supplied_unverified' },
      ],
      configuration: { ...configuration, runConfiguration: { sourceSha256: sha(configurationBytes), locator: '/declaration' } },
      question, scope, m05: records,
      m06: supply.map((value, index) => ({ ...value, observation: { ...value.observation, source: sourceRef(`/supply/${index}`), aggregation: null } })),
      // The UI peer selection does not supply an anchor/baseline declaration; do not manufacture one.
      m07: records, peerSet: null,
      m09: events.map((event, index) => ({ ...event, source: sourceRef(`/events/${index}`), targetLink: sourceRef(`/events/${index}/namedScope`),
        conflictRefs: events.flatMap((other, otherIndex) => otherIndex !== index && other.namedScope === event.namedScope
          ? [sourceRef(`/events/${otherIndex}`)] : []),
      })),
    };
    const files = new Map<string, Buffer>([
      [PROFILE, profile], [ADOPTION, adoption], [NORMALIZED, normalizedBytes], [CONFIGURATION, configurationBytes], [DESCRIPTOR, json(descriptor)],
    ]);
    const metadata: SourcePackageIntakeRequest['files'][number][] = [];
    for (const [filePath, bytes] of files) {
      if (bytes.length > MAX_JSON_ARTIFACT_BYTES) throw new ResearchAutomationIntegrityError('Automation method input exceeds its bound.');
      const authority = filePath.startsWith('authority/');
      metadata.push({ path: filePath, sha256: sha(bytes), byteSize: bytes.length, mediaType: authority ? 'text/markdown' : 'application/json',
        evidenceFamily: filePath === NORMALIZED ? 'kalodata-automation' : 'automation-method-configuration',
        representationRole: 'derived', independence: 'non_independent',
        providerProvenance: filePath === NORMALIZED ? 'provider_reported' : 'operator_supplied_unverified',
        provenanceBasis: authority ? 'Exact adopted method authority bytes; not provider evidence.' : 'Application-derived declaration from the frozen run and checked capture fields; not independent evidence.' });
    }
    for (const capture of captures) {
      const filePath = `captures/collection-${capture.ordinal}.json`;
      const bytes = captureBytes.get(capture.artifactSha256)!;
      files.set(filePath, bytes);
      metadata.push({ path: filePath, sha256: capture.artifactSha256, byteSize: bytes.length, mediaType: capture.mediaType,
        evidenceFamily: 'kalodata-automation', representationRole: 'primary', independence: 'non_independent', providerProvenance: 'provider_reported',
        provenanceBasis: 'Exact retained request/response envelope; independent source truth and full-period coverage are not established.' });
    }
    return {
      files,
      request: { contractVersion: '1.0.0', packageKey: `automation-method:${input.runId}-descriptive-v2`, version: 1,
        sourceAcquiredAt: [...captures].map(value => value.retrievedAt).sort().at(-1) ?? null,
        sourceLabel: `Automation ${input.runId}: source-bound descriptive inputs`, files: metadata as SourcePackageIntakeRequest['files'] },
    };
  }
}
