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
const BUDGET = { maxFileBytes: MAX_JSON_ARTIFACT_BYTES, maxTotalBytes: 128 * 1024 * 1024 };
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
function integrity(message: string): never { throw new ResearchAutomationIntegrityError(message); }

interface Input extends ExactShopeeRunInput {
  reference: NonNullable<StepResultDocument['exactShopee']>;
}
type Identity = Parameters<typeof buildPackageLocatedInsightExtension>[1] & {};
export interface AutomationLocatedReviewSnapshot {
  contractVersion: 'automation-located-review-snapshot-v1';
  runId: string;
  sourcePackage: Identity;
  authorityState: 'RULE_PROPOSAL_ONLY';
  codingSha256: string;
  codingId: string;
  rulesSha256: string;
  output: LocatedInsightMethods;
}

/** Retains diagnostics for rule review, not permission to publish candidate codes as findings. */
export class AutomationLocatedReviewBridge {
  readonly #packages: SourcePackageService;
  readonly #source: AutomationExactShopeeBridge;
  readonly #db: Database.Database;
  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date }) {
    this.#db = options.db;
    this.#packages = new SourcePackageService(options);
    this.#source = new AutomationExactShopeeBridge(options.db, options.artifactStore);
  }

  async execute(input: Input, signal?: AbortSignal): Promise<AutomationLocatedReviewSnapshot> {
    signal?.throwIfAborted();
    const corpus = buildResearchReviewCorpus(await this.#source.read(input.reference, input));
    const rules = readLiteralReviewRulesV1();
    const coding = codeLiteralReviews(corpus, rules);
    // Until the specific rule revision is reviewed, no generated candidate is
    // admitted to a report's analytical sections. Candidate bytes remain intact.
    const descriptor: LocatedInsightMethods['input'] = {
      contractVersion: '1.0.0', codebookId: coding.output.rules.codebookId,
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
    const snapshot = untrusted as AutomationLocatedReviewSnapshot;
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
