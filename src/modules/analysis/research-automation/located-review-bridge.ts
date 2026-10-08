import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { buildPackageLocatedInsightExtension } from '../report-located-insight-extension.js';
import { AutomationExactShopeeBridge, type ExactShopeeRunInput } from './exact-shopee-bridge.js';
import { codeLiteralReviews, readLiteralReviewRulesV1, type LiteralReviewCoding } from './literal-review-coding.js';
import { buildSourcePackageLiteralReviewProjection } from './source-package-literal-review-projection.js';
import type { SourcePackageLiteralReviewDiagnostics } from './source-package-literal-review-adapter.js';
import { buildResearchReviewCorpus } from './review-corpus.js';
import { MAX_JSON_ARTIFACT_BYTES, ResearchAutomationIntegrityError, type StepResultDocument } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const PROFILE = 'authority/qualitative-profile.md';
const ADOPTION = 'authority/method-adoption.md';
const RULES = 'rules/literal-review-rules.json';
const BRIEF = 'rules/literal-review-semantics.md';
const PARSER = 'rules/literal-review-parser.ts';
const CONFIG = 'normalized/run.json';
const CORPUS = 'normalized/review-corpus.json';
const CODING = 'methods/literal-coding.json';
const DESCRIPTOR = 'methods/located-input.json';
const OUTPUT = 'methods/located-output.json';
const SCHEMA = 'profiles/located-insight-methods.schema.json';
const PATHS = [PROFILE, ADOPTION, RULES, BRIEF, PARSER, CONFIG, CORPUS, CODING, DESCRIPTOR, OUTPUT, SCHEMA];
const PROJECTION = 'methods/literal-declaration-projection.json';
const PROJECTION_INPUT = 'methods/literal-declaration-input.json';
const PROJECTION_OUTPUT = 'methods/literal-declaration-output.json';
const PROJECTION_CONFIG = 'normalized/projection-run.json';
const PROPOSAL = 'dependencies/located-review-proposal.json';
const DIAGNOSTICS = 'methods/literal-located-diagnostics.json';
const POLICY = 'authority/literal-review-projection-policy-v1.json';
const ADAPTER = 'rules/source-package-literal-review-adapter.ts';
const PROJECTOR = 'rules/literal-review-projection.ts';
const WRAPPER = 'rules/source-package-literal-review-projection.ts';
const PROJECTION_PATHS = [...PATHS, PROJECTION, PROJECTION_INPUT, PROJECTION_OUTPUT, PROJECTION_CONFIG, PROPOSAL,
  DIAGNOSTICS, POLICY, ADAPTER, PROJECTOR, WRAPPER, 'methods/located-insight-bundle.json'];
const POLICY_SHA256 = 'ba676c8e9e89f7ba0f05ec6157b82414524f6af48697900afe61ac7e0dc64f42';
const PROJECTOR_SHA256 = 'a5195185db078e8ac03427885e24f72ec9c3eb0cce75d85ad8f081e5f04f0daa';
const WRAPPER_SHA256 = '160e97c67ac9c42fe0105f3cb147dd8aee13bc7dedb62afaeaca8baeadf083d7';
const BUDGET = { maxFileBytes: MAX_JSON_ARTIFACT_BYTES, maxTotalBytes: 128 * 1024 * 1024 };
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
function integrity(message: string): never { throw new ResearchAutomationIntegrityError(message); }

interface Input extends ExactShopeeRunInput {
  reference: NonNullable<StepResultDocument['exactShopee']>;
  /** U-02: an explicit upstream (model or owner) proposal. When a run supplies one it is retained verbatim instead of
   * the scope-derived system template; the located review run built by the service supplies none. */
  workingQuestionProposal?: string | null;
}

/**
 * U-02 scope question template. Deterministic, versioned with the method semantics and derived only from the frozen
 * run scope. It is a system proposal awaiting the owner, is never written into an owner-authored brief field, and
 * never selects, filters or weights evidence.
 */
export function locatedScopeWorkingQuestion(scopeDefinition: string): string {
  return `Câu hỏi làm việc đề xuất (mẫu do hệ thống tạo từ phạm vi đã chốt, chưa phải kết luận của AI): `
    + `khách hàng nêu rào cản, lý do, thái độ và mong muốn nào trong phạm vi "${scopeDefinition}"? `
    + `Chủ dự án xác nhận hoặc thay bằng câu hỏi của mình.`;
}
type Identity = Parameters<typeof buildPackageLocatedInsightExtension>[1] & {};
export interface AutomationLocatedReviewProposalSnapshot {
  contractVersion: 'automation-located-review-snapshot-v1';
  runId: string;
  sourcePackage: Identity;
  authorityState: 'RULE_PROPOSAL_ONLY';
  codingSha256: string;
  codingId: string;
  rulesSha256: string;
  output: LocatedInsightMethods;
}
type ProjectionDocument = Awaited<ReturnType<typeof buildSourcePackageLiteralReviewProjection>>['output'];
export interface AutomationLocatedReviewAdoptedSnapshot {
  contractVersion: 'automation-located-review-snapshot-v2';
  runId: string;
  authorityState: 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS';
  proposal: AutomationLocatedReviewProposalSnapshot;
  sourcePackage: Identity;
  projectionSha256: string;
  projectionId: string;
  policySha256: string;
  projection: ProjectionDocument['projection'];
  output: LocatedInsightMethods;
}
export type AutomationLocatedReviewSnapshot = AutomationLocatedReviewProposalSnapshot | AutomationLocatedReviewAdoptedSnapshot;

/** Retains the original proposal and a separate adopted, source-bound declaration overlay. */
export class AutomationLocatedReviewBridge {
  readonly #packages: SourcePackageService;
  readonly #source: AutomationExactShopeeBridge;
  readonly #db: Database.Database;
  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date }) {
    this.#db = options.db;
    this.#packages = new SourcePackageService(options);
    this.#source = new AutomationExactShopeeBridge(options.db, options.artifactStore);
  }

  async execute(input: Input, signal?: AbortSignal): Promise<AutomationLocatedReviewAdoptedSnapshot> {
    const proposal = await this.#prepareProposal(input, signal);
    const original = await this.#packages.readVerified(proposal.sourcePackage.packageId, BUDGET);
    const prepared = await buildSourcePackageLiteralReviewProjection({ sourcePackage: proposal.sourcePackage, logicalPath: DESCRIPTOR },
      new FoundationSourcePackageReader(this.#packages), readLiteralReviewRulesV1());
    if (prepared.output.implementation.projectionSha256 !== PROJECTOR_SHA256 || prepared.output.implementation.wrapperSha256 !== WRAPPER_SHA256)
      integrity('Located projection implementation differs from its reviewed bytes.');
    signal?.throwIfAborted();
    const files = new Map(original.files.map(value => [value.path, value.bytes]));
    for (const [filePath, bytes] of prepared.files) {
      if (files.has(filePath) && !files.get(filePath)!.equals(bytes)) integrity('Located projection collides with retained proposal bytes.');
      files.set(filePath, bytes);
    }
    const proposalBytes = json(proposal);
    files.set(PROPOSAL, proposalBytes);
    files.set(PROJECTION_CONFIG, json({ contractVersion: 'automation-literal-projection-run-v1', ...input,
      authorityState: prepared.output.authorityState, proposalSha256: sha(proposalBytes) }));
    for (const bytes of files.values()) if (bytes.length > MAX_JSON_ARTIFACT_BYTES) integrity('Located projection preparation exceeds its bound.');
    const originalMetadata = new Map(original.manifest.files.map(value => [value.path, value]));
    const firstFile = originalMetadata.get(PROFILE);
    if (!firstFile) integrity('Located projection original authority file is missing.');
    const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: `automation-method:${input.runId}-located-review-v2`,
      version: 1, sourceAcquiredAt: original.manifest.sourceAcquiredAt,
      sourceLabel: 'Exact retained review proposal and adopted partial source-bound declarations',
      files: [firstFile, ...[...files].filter(([filePath]) => filePath !== PROFILE)
        .map(([filePath, bytes]) => originalMetadata.get(filePath) ?? metadata(filePath, bytes))] };
    return withDatabaseMutationMutex(this.#db, async () => {
      signal?.throwIfAborted();
      const receipt = await this.#packages.intake(request, files);
      const retained = await this.#packages.readVerified(receipt.packageId, BUDGET);
      if (retained.files.length !== files.size || retained.files.some(value => !files.get(value.path)?.equals(value.bytes)))
        integrity('Located projection intake differs from its prepared bytes.');
      signal?.throwIfAborted();
      return { contractVersion: 'automation-located-review-snapshot-v2', runId: input.runId,
        authorityState: prepared.output.authorityState, proposal, sourcePackage: packageIdentity(retained),
        projectionSha256: sha(prepared.bytes), projectionId: prepared.output.projectionId,
        policySha256: prepared.output.policySha256, projection: prepared.output.projection, output: prepared.locatedOutput };
    });
  }

  async #prepareProposal(input: Input, signal?: AbortSignal): Promise<AutomationLocatedReviewProposalSnapshot> {
    signal?.throwIfAborted();
    const corpus = buildResearchReviewCorpus(await this.#source.read(input.reference, input));
    const rules = readLiteralReviewRulesV1();
    const coding = codeLiteralReviews(corpus, rules);
    // Until the specific rule revision is reviewed, no generated candidate is
    // admitted to a report's analytical sections. Candidate bytes remain intact.
    // U-02 producer: every newly prepared located descriptor carries semanticsVersion 1.1.0, so I01 reports the
    // labelled working-question state (with the owner fields to add) instead of the historical hard blocker. The
    // proposal text is only ever what the run supplied; retained 1.0.0 packages keep building and replaying as-is.
    const descriptor: LocatedInsightMethods['input'] = {
      contractVersion: '1.0.0', semanticsVersion: '1.1.0',
      workingQuestionProposal: typeof input.workingQuestionProposal === 'string' && input.workingQuestionProposal.trim()
        ? input.workingQuestionProposal : locatedScopeWorkingQuestion(input.scope.definition),
      codebookId: coding.output.rules.codebookId,
      profileSha256: coding.output.rules.profileSha256, adoptionSha256: coding.output.rules.adoptionSha256,
      question: input.scope.definition, inclusionRule: 'Exact selected listing, readable nonconflicting records only. No category or period inference.',
      codingUnit: 'LOCATED_RECORD', adjudicationRule: 'Literal rules are a proposal. Generated candidates are retained separately and not admitted as report findings.',
      sources: [{ logicalPath: CORPUS, sha256: sha(corpus.bytes) }], records: coding.output.records,
      brief: null, i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], corpora: [], i13Mentions: [],
    };
    const files = new Map<string, Buffer>([
      [PROFILE, await fs.readFile(new URL('../../../../docs/research/method-configurations-v1/qualitative-profile.md', import.meta.url))],
      [ADOPTION, await fs.readFile(new URL('../../../../docs/research/method-configurations-v1-adoption.md', import.meta.url))],
      [SCHEMA, await fs.readFile(new URL('../../../../contracts/analysis/located-insight-methods.schema.json', import.meta.url))],
      [BRIEF, await fs.readFile(new URL('../../../../docs/tasks/research-literal-review-coding-v1.md', import.meta.url))],
      [PARSER, await fs.readFile(new URL('./literal-review-coding.ts', import.meta.url))],
      [RULES, rules], [CORPUS, corpus.bytes], [CODING, coding.bytes], [DESCRIPTOR, json(descriptor)],
      [CONFIG, json({ contractVersion: 'automation-located-review-run-v1', ...input, authorityState: 'RULE_PROPOSAL_ONLY' })],
    ]);
    // The output has no package UUID/digest dependency, so it can be retained in
    // the package without a self-referential content digest.
    const { buildLocatedInsightMethods } = await import('../located-insight-methods.js');
    files.set(OUTPUT, buildLocatedInsightMethods(descriptor).bytes);
    for (const bytes of files.values()) if (bytes.length > MAX_JSON_ARTIFACT_BYTES) integrity('Located review preparation exceeds its bound.');
    const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: `automation-method:${input.runId}-located-review-v1`,
      version: 1, sourceAcquiredAt: null, sourceLabel: 'Exact retained review corpus and unadopted literal-rule diagnostics',
      files: [metadata(PROFILE, files.get(PROFILE)!), ...[...files].filter(([filePath]) => filePath !== PROFILE)
        .map(([filePath, bytes]) => metadata(filePath, bytes))] };
    return withDatabaseMutationMutex(this.#db, async () => {
      signal?.throwIfAborted();
      const receipt = await this.#packages.intake(request, files);
      const retained = await this.#packages.readVerified(receipt.packageId, BUDGET);
      if (retained.files.length !== files.size || retained.files.some(file => !files.get(file.path)?.equals(file.bytes))) integrity('Located review intake differs from its prepared bytes.');
      const identity = packageIdentity(retained);
      const built = await buildPackageLocatedInsightExtension(DESCRIPTOR, identity, new FoundationSourcePackageReader(this.#packages));
      if (!built || canonicalJson(built.output) !== canonicalJson(parse(retained, OUTPUT))) integrity('Located review output differs from its frozen output.');
      signal?.throwIfAborted();
      return { contractVersion: 'automation-located-review-snapshot-v1', runId: input.runId, sourcePackage: identity,
        authorityState: 'RULE_PROPOSAL_ONLY', codingSha256: sha(coding.bytes), codingId: coding.output.codingId,
        rulesSha256: sha(rules), output: built.output };
    });
  }

  /** Reads retained bytes and schema only; no current parser, rule file, calculator or provider. */
  async verify(untrusted: unknown, input: Input): Promise<AutomationLocatedReviewSnapshot> {
    if (!untrusted || typeof untrusted !== 'object' || Array.isArray(untrusted) || json(untrusted).length > MAX_JSON_ARTIFACT_BYTES)
      integrity('Located review snapshot is invalid.');
    if (untrusted && typeof untrusted === 'object' && 'contractVersion' in untrusted &&
        untrusted.contractVersion === 'automation-located-review-snapshot-v2') return this.#verifyProjection(untrusted, input);
    return this.#verifyProposal(untrusted, input);
  }

  async readSnapshot(sourcePackage: AutomationLocatedReviewAdoptedSnapshot['sourcePackage'], input: Input): Promise<AutomationLocatedReviewAdoptedSnapshot> {
    const retained = await this.#packages.readVerified(sourcePackage.packageId, BUDGET);
    if (canonicalJson(sourcePackage) !== canonicalJson(packageIdentity(retained)))
      integrity('Located declaration fallback package identity differs.');
    const projection = parse(retained, PROJECTION) as ProjectionDocument;
    const snapshot: AutomationLocatedReviewAdoptedSnapshot = {
      contractVersion: 'automation-located-review-snapshot-v2',
      runId: input.runId,
      authorityState: 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS',
      proposal: parse(retained, PROPOSAL) as AutomationLocatedReviewProposalSnapshot,
      sourcePackage,
      projectionSha256: file(retained, PROJECTION).sha256,
      projectionId: projection.projectionId,
      policySha256: projection.policySha256,
      projection: projection.projection,
      output: parse(retained, PROJECTION_OUTPUT) as LocatedInsightMethods,
    };
    // The retained package is the bounded source of truth. Existing projection
    // verification replays only frozen identities and bytes; it does not run
    // the current parser, rules, model, or provider.
    return this.#verifyProjection(snapshot, input);
  }

  async #verifyProposal(untrusted: unknown, input: Input): Promise<AutomationLocatedReviewProposalSnapshot> {
    if (!untrusted || typeof untrusted !== 'object' || Array.isArray(untrusted))
      integrity('Located review snapshot is invalid.');
    const snapshot = untrusted as AutomationLocatedReviewProposalSnapshot;
    if (Object.keys(snapshot).sort().join(',') !== 'authorityState,codingId,codingSha256,contractVersion,output,rulesSha256,runId,sourcePackage' ||
        snapshot.contractVersion !== 'automation-located-review-snapshot-v1' || snapshot.authorityState !== 'RULE_PROPOSAL_ONLY' ||
        snapshot.runId !== input.runId || typeof snapshot.sourcePackage?.packageId !== 'string') integrity('Located review snapshot identity differs.');
    const retained = await this.#packages.readVerified(snapshot.sourcePackage.packageId, BUDGET);
    if (canonicalJson(snapshot.sourcePackage) !== canonicalJson(packageIdentity(retained)) ||
        retained.manifest.packageKey !== `automation-method:${input.runId}-located-review-v1` || retained.manifest.version !== 1 ||
        retained.files.length !== PATHS.length || retained.files.some(file => !PATHS.includes(file.path))) integrity('Located review package membership differs.');
    for (const file of retained.files) {
      const { bytes: _bytes, ...actual } = file;
      if (canonicalJson(actual) !== canonicalJson(metadata(file.path, file.bytes))) integrity('Located review file role differs.');
    }
    if (canonicalJson(parse(retained, CONFIG)) !== canonicalJson({ contractVersion: 'automation-located-review-run-v1', ...input,
      authorityState: 'RULE_PROPOSAL_ONLY' })) integrity('Located review configuration differs from the frozen run.');
    const corpus = buildResearchReviewCorpus(await this.#source.read(input.reference, input));
    if (!file(retained, CORPUS).bytes.equals(corpus.bytes)) integrity('Located review corpus differs from its Foundation collection.');
    const coding = parse(retained, CODING) as LiteralReviewCoding;
    const { codingId, ...codingBody } = coding;
    if (file(retained, CODING).sha256 !== snapshot.codingSha256 || codingId !== snapshot.codingId || sha(json(codingBody)) !== codingId ||
        coding.executionAuthority !== 'NONE_RULE_PROPOSAL_ONLY' || coding.rules?.declaredStatus !== 'PROPOSAL_PENDING_BUSINESS_REVIEW' ||
        coding.rules.sha256 !== snapshot.rulesSha256 || file(retained, RULES).sha256 !== snapshot.rulesSha256 ||
        coding.corpus?.corpusBytesSha256 !== sha(corpus.bytes) || coding.corpus.corpusId !== corpus.output.corpusId)
      integrity('Located review coding identity differs.');
    const output = parse(retained, OUTPUT) as LocatedInsightMethods;
    if (canonicalJson(snapshot.output) !== canonicalJson(output)) integrity('Located review report output differs from retained bytes.');
    const schema = parse(retained, SCHEMA);
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
        (schema as Record<string, unknown>).$id !== 'https://tdn.local/contracts/analysis/located-insight-methods.schema.json') integrity('Located review retained schema identity differs.');
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    if (!ajv.compile(schema)(output)) integrity('Located review output fails its retained schema.');
    const { methodOutputId, ...body } = output;
    if (sha(json(body)) !== methodOutputId || canonicalJson(output.input) !== canonicalJson(parse(retained, DESCRIPTOR)) ||
        file(retained, PROFILE).sha256 !== output.input.profileSha256 || file(retained, ADOPTION).sha256 !== output.input.adoptionSha256 ||
        canonicalJson(output.input.records) !== canonicalJson(coding.records) ||
        canonicalJson(output.input.sources) !== canonicalJson([{ logicalPath: CORPUS, sha256: sha(corpus.bytes) }]) ||
        [output.input.i02, output.input.i04, output.input.i05, output.input.i06, output.input.i07, output.input.i08, output.input.i09,
          output.input.corpora, output.input.i13Mentions].some(rows => rows.length !== 0)) integrity('Unadopted review candidates were admitted or evidence identity differs.');
    return snapshot;
  }

  async #verifyProjection(untrusted: unknown, input: Input): Promise<AutomationLocatedReviewAdoptedSnapshot> {
    if (!untrusted || typeof untrusted !== 'object' || Array.isArray(untrusted))
      integrity('Located projection snapshot is invalid.');
    const snapshot = untrusted as AutomationLocatedReviewAdoptedSnapshot;
    if (Object.keys(snapshot).sort().join(',') !== 'authorityState,contractVersion,output,policySha256,projection,projectionId,projectionSha256,proposal,runId,sourcePackage' ||
        snapshot.authorityState !== 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS' || snapshot.runId !== input.runId ||
        snapshot.policySha256 !== POLICY_SHA256 || typeof snapshot.sourcePackage?.packageId !== 'string')
      integrity('Located projection snapshot identity differs.');
    const proposal = await this.#verifyProposal(snapshot.proposal, input);
    const [original, retained] = await Promise.all([
      this.#packages.readVerified(proposal.sourcePackage.packageId, BUDGET),
      this.#packages.readVerified(snapshot.sourcePackage.packageId, BUDGET),
    ]);
    if (canonicalJson(snapshot.sourcePackage) !== canonicalJson(packageIdentity(retained)) ||
        retained.manifest.packageKey !== `automation-method:${input.runId}-located-review-v2` || retained.manifest.version !== 1 ||
        retained.files.length !== PROJECTION_PATHS.length || retained.files.some(value => !PROJECTION_PATHS.includes(value.path)))
      integrity('Located projection package membership differs.');
    const originalMetadata = new Map(original.manifest.files.map(value => [value.path, value]));
    for (const value of retained.files) {
      const { bytes, ...actual } = value;
      if (canonicalJson(actual) !== canonicalJson(originalMetadata.get(value.path) ?? metadata(value.path, bytes)) ||
          (originalMetadata.has(value.path) && !file(original, value.path).bytes.equals(bytes)))
        integrity('Located projection file role or original dependency differs.');
    }
    if (canonicalJson(parse(retained, PROPOSAL)) !== canonicalJson(proposal) ||
        canonicalJson(parse(retained, PROJECTION_CONFIG)) !== canonicalJson({ contractVersion: 'automation-literal-projection-run-v1', ...input,
          authorityState: snapshot.authorityState, proposalSha256: file(retained, PROPOSAL).sha256 }))
      integrity('Located projection configuration differs from the frozen run.');
    const overlay = parse(retained, PROJECTION) as ProjectionDocument;
    const { projectionId, ...overlayBody } = overlay;
    const diagnostics = parse(retained, DIAGNOSTICS) as SourcePackageLiteralReviewDiagnostics;
    const { codingId, ...diagnosticsBody } = diagnostics;
    const policy = parse(retained, POLICY) as Pick<ProjectionDocument, 'policyRevision' | 'authorityState' | 'acceptedTuple' | 'acceptanceTurnId' | 'adoptionTurnId'>;
    const acceptedTuple = { rulesSha256: file(retained, RULES).sha256, parserSha256: file(retained, PARSER).sha256,
      adapterSha256: file(retained, ADAPTER).sha256, semanticsSha256: file(retained, BRIEF).sha256 };
    if (file(retained, PROJECTION).sha256 !== snapshot.projectionSha256 || projectionId !== snapshot.projectionId ||
        sha(json(overlayBody)) !== projectionId || overlay.contractVersion !== 'source-package-literal-declaration-projection-v1' ||
        overlay.authorityState !== snapshot.authorityState || overlay.sectionState !== 'PARTIAL' ||
        overlay.policyRevision !== 'literal-source-bound-v1' || policy.policyRevision !== overlay.policyRevision ||
        policy.authorityState !== overlay.authorityState || file(retained, POLICY).sha256 !== snapshot.policySha256 ||
        overlay.policySha256 !== snapshot.policySha256 || policy.acceptanceTurnId !== overlay.acceptanceTurnId || policy.adoptionTurnId !== overlay.adoptionTurnId ||
        canonicalJson(policy.acceptedTuple) !== canonicalJson(acceptedTuple) || canonicalJson(overlay.acceptedTuple) !== canonicalJson(acceptedTuple) ||
        file(retained, PROJECTOR).sha256 !== PROJECTOR_SHA256 || file(retained, WRAPPER).sha256 !== WRAPPER_SHA256 ||
        canonicalJson(overlay.implementation) !== canonicalJson({ projectionSha256: file(retained, PROJECTOR).sha256, wrapperSha256: file(retained, WRAPPER).sha256 }) ||
        canonicalJson(overlay.sourcePackage) !== canonicalJson(proposal.sourcePackage) || canonicalJson(diagnostics.sourcePackage) !== canonicalJson(proposal.sourcePackage) ||
        canonicalJson(overlay.descriptor) !== canonicalJson({ logicalPath: DESCRIPTOR, sha256: file(original, DESCRIPTOR).sha256, byteSize: file(original, DESCRIPTOR).byteSize }) ||
        canonicalJson(diagnostics.descriptor) !== canonicalJson(overlay.descriptor) ||
        file(retained, DIAGNOSTICS).sha256 !== overlay.codingSha256 || codingId !== overlay.codingId || sha(json(diagnosticsBody)) !== codingId ||
        diagnostics.contractVersion !== 'source-package-literal-review-diagnostics-v1' || diagnostics.authorityState !== 'RULE_PROPOSAL_ONLY' ||
        diagnostics.diagnostics.executionAuthority !== 'NONE_RULE_PROPOSAL_ONLY' || diagnostics.diagnostics.rules.declaredStatus !== 'PROPOSAL_PENDING_BUSINESS_REVIEW' ||
        diagnostics.diagnostics.rules.sha256 !== acceptedTuple.rulesSha256 ||
        canonicalJson(diagnostics.implementation) !== canonicalJson({ parserSha256: acceptedTuple.parserSha256, adapterSha256: acceptedTuple.adapterSha256, semanticsSha256: acceptedTuple.semanticsSha256 }) ||
        diagnostics.locatedOutputId !== proposal.output.methodOutputId || canonicalJson(diagnostics.diagnostics.records) !== canonicalJson(proposal.output.input.records) ||
        canonicalJson(overlay.projection) !== canonicalJson(snapshot.projection) ||
        canonicalJson(overlay.projection.pending) !== canonicalJson(diagnostics.diagnostics.pending))
      integrity('Located projection retained authority or diagnostic identity differs.');
    const output = parse(retained, PROJECTION_OUTPUT) as LocatedInsightMethods;
    const schema = parse(retained, SCHEMA);
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
        (schema as Record<string, unknown>).$id !== 'https://tdn.local/contracts/analysis/located-insight-methods.schema.json')
      integrity('Located projection retained schema identity differs.');
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    if (!ajv.compile(schema)(output)) integrity('Located projection output fails its retained schema.');
    const { methodOutputId, ...body } = output;
    const { i02, i04, i05, i07, i08, adjudicationRule: _rule, ...base } = output.input;
    const { i02: _i02, i04: _i04, i05: _i05, i07: _i07, i08: _i08, adjudicationRule: _oldRule, ...proposalBase } = proposal.output.input;
    if (sha(json(body)) !== methodOutputId || canonicalJson(snapshot.output) !== canonicalJson(output) ||
        canonicalJson(overlay.output) !== canonicalJson(output) || canonicalJson(parse(retained, PROJECTION_INPUT)) !== canonicalJson(output.input) ||
        canonicalJson(base) !== canonicalJson(proposalBase) || canonicalJson({ i02, i04, i05, i07, i08 }) !== canonicalJson(overlay.projection.candidates))
      integrity('Located projection report output differs from retained declarations.');
    for (const key of ['i02', 'i04', 'i05', 'i07', 'i08'] as const) {
      const references = overlay.projection.admitted.filter(value => value.family === key.toUpperCase());
      const selected = references.map(value => diagnostics.diagnostics.candidates[key][value.candidateIndex]);
      if (canonicalJson(selected) !== canonicalJson(output.input[key]) || output.input[key].some(value =>
        value.provenance.basis !== 'DECLARED' || value.provenance.adjudication !== null || value.provenance.disagreement !== null))
        integrity('Located projection candidate selection or provenance differs.');
    }
    return snapshot;
  }
}

function packageIdentity(retained: VerifiedFinalizedSourcePackage): Identity {
  return { packageId: retained.packageId, manifestArtifactSha256: retained.manifestArtifactSha256,
    packageContentSha256: retained.packageContentSha256, manifest: retained.manifest };
}
function file(retained: VerifiedFinalizedSourcePackage, filePath: string) {
  const found = retained.files.find(value => value.path === filePath);
  if (!found) integrity('Located review retained file is missing.');
  return found;
}
function parse(retained: VerifiedFinalizedSourcePackage, filePath: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file(retained, filePath).bytes)); }
  catch { return integrity('Located review retained JSON is invalid.'); }
}
function metadata(filePath: string, bytes: Buffer): SourcePackageIntakeRequest['files'][number] {
  return { path: filePath, sha256: sha(bytes), byteSize: bytes.length, mediaType: filePath.endsWith('.md') ? 'text/markdown' : filePath.endsWith('.ts') ? 'text/plain' : 'application/json',
    evidenceFamily: filePath === CORPUS ? 'shopee-exact-retained-review-corpus' : 'automation-literal-review-diagnostics',
    representationRole: 'derived', independence: 'non_independent', providerProvenance: 'operator_supplied_unverified',
    provenanceBasis: 'Derived from retained evidence or rule declarations. Exact bytes do not certify provider authenticity, semantic truth or human report approval.' };
}
