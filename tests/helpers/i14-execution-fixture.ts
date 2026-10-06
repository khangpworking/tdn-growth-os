import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AutomationI14EvidenceAdmissionInput } from '../../src/modules/analysis/research-automation/i14-evidence-admission.js';
import { buildAutomationI14EvidenceAdmission } from '../../src/modules/analysis/research-automation/i14-evidence-admission.js';
import type { AutomationI14ExecutionParent } from '../../src/modules/analysis/research-automation/i14-synthesis-execution.js';
import type { ScopeSnapshot } from '../../src/modules/analysis/research-automation/model.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';
import { locatedInsightFixture, locatedSpan } from './located-insight-fixture.js';

export const I14_WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
export const I14_RUN_ID = '22222222-2222-4222-8222-222222222222';
export const i14Now = () => new Date('2026-10-02T00:00:00.000Z');

const sha = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const pkg = { packageId: '33333333-3333-4333-8333-333333333333', version: 1, manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) };
const provenance = { basis: 'DECLARED' as const, coderRole: 'synthetic coder', adjudication: null, disagreement: null };
const absent = { state: 'NOT_STATED' as const, span: null };
const workText = 'I take the fan to work, but it is too loud in the office.';

function locatedOutput(): LocatedInsightMethods {
  const input = locatedInsightFixture();
  input.records.push({ sourceSha256: '1'.repeat(64), locator: '/records/0/text', text: workText,
    sourceAttribution: 'Synthetic account', timeText: null, disposition: 'INCLUDED', dispositionReason: null });
  input.i02 = [{ recordIndex: 0, provenance: { ...provenance }, qualifiers: [],
    counterevidence: [locatedSpan(workText, 'it is too loud in the office')], role: absent, situation: absent, task: absent,
    setting: { state: 'SOURCE_STATED' as const, span: locatedSpan(workText, 'to work') }, time: absent }];
  return buildLocatedInsightMethods(input).output;
}

const claimSpan = (role: 'DECLARATION' | 'COUNTEREVIDENCE', quote: string) => ({ role, ...locatedSpan(workText, quote) });

/** A valid admitted source input bound to the caller's exact frozen run and scope. */
export function syntheticI14Input(runId = I14_RUN_ID, workspaceId = I14_WORKSPACE_ID, scope = syntheticScope(runId, workspaceId)): AutomationI14EvidenceAdmissionInput {
  const scopeSha256 = sha(scope);
  const output = locatedOutput();
  const body = {
    sectionId: 'I02' as const,
    method: { methodId: 'located-insight-methods', methodVersion: '1.0.0', methodOutputId: output.methodOutputId, artifact: pkg, outputPointer: '/input/i02/0' },
    source: { package: pkg, logicalPath: 'accounts.json', sha256: '1'.repeat(64), locator: '/records/0/text', recordLocator: '/records/0/text', statement: null,
      attribution: 'Synthetic account', spans: [claimSpan('DECLARATION', 'to work'), claimSpan('COUNTEREVIDENCE', 'it is too loud in the office')] },
    observation: { basis: 'DECLARED' as const, state: 'DECLARED' as const, measure: null, value: null, unit: null, precision: 'not_applicable' as const,
      period: null, periodText: null, scope: { scopeSha256, universe: null, geography: null, frame: null, inclusionRule: null, exclusionRule: null, variantRule: null, description: 'Synthetic frozen run scope' },
      coverage: { unit: 'LOCATED_RECORDS' as const, observedCount: 1, zeroCount: 0, missingCount: 0, unknownCount: 0, nonExactCount: 0, description: 'One located record' },
      limitations: ['DECLARED_SOURCE_READING_NOT_AUTHENTICATED_OR_OWNER_APPROVED'] },
    declaration: { sourceAttribution: 'Synthetic account', annotationAttribution: null, provenance },
    limitations: ['EMPTY_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS'],
  };
  const claim = { claimId: sha(body), ...body };
  const claims = [claim];
  return {
    run: { runId, workspaceId }, scope, claimsSha256: sha(claims), locatedMethodOutput: output,
    sourceClaims: { contractVersion: '1.0.0', methodId: 'automation-source-claims', methodVersion: '1.0.0', runId, workspaceId, scopeSha256,
      claimsSha256: sha(claims), claims, limitations: ['SYNTHETIC_SOURCE_CLAIMS_FIXTURE'] },
  };
}

export function syntheticScope(runId = I14_RUN_ID, workspaceId = I14_WORKSPACE_ID): ScopeSnapshot {
  return { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic portable desk fans',
    includeTerms: ['quat mini'], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
}

export function validI14Response(input: AutomationI14EvidenceAdmissionInput): { readonly aiCandidates: readonly Record<string, unknown>[] } {
  const admission = buildAutomationI14EvidenceAdmission(input).artifact;
  const claimId = admission.anchors[0]?.claimId;
  if (!claimId) throw new Error('Synthetic I14 fixture did not produce an admitted anchor.');
  return { aiCandidates: [{ candidateType: 'HYPOTHESIS', candidateStatus: 'HUMAN_REVIEW_REQUIRED', layer: 3,
    text: 'A portable fan may fit someone who takes it to work, if office noise is acceptable to them.',
    conciseEvidenceLinkedRationale: 'One located record states a work setting and also states the fan is too loud in the office.',
    citedClaimRefs: [claimId], counterevidenceRefs: [],
    assumptions: ['The stated work setting describes ordinary use rather than a single trip.'],
    unknowns: ['Whether other located records describe work use at all.'],
    evidenceGaps: ['No source states noise tolerance in a comparable office.'],
    limitations: ['A located record is not a person, segment or market.'] }] };
}

export interface PausedI14Parent {
  readonly root: string;
  readonly db: ReturnType<typeof openDatabase>['db'];
  readonly artifacts: ContentAddressedArtifactStore;
  readonly service: ResearchAutomationService;
  readonly scope: ScopeSnapshot;
  readonly parent: AutomationI14ExecutionParent;
  readonly reportPromise: Promise<boolean>;
  readonly release: () => void;
  cleanup(): Promise<void>;
}

/** Start a real service run and pause its REPORTS renderer while the parent is RUNNING. */
export async function pausedI14Parent(options: {
  readonly migrationsDirectory?: string;
  readonly reports?: readonly ('MARKET' | 'INSIGHT')[];
} = {}): Promise<PausedI14Parent> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-i14-execution-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now: i14Now,
    ...(options.migrationsDirectory ? { migrationsDirectory: options.migrationsDirectory } : {}) }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => I14_WORKSPACE_ID, now: i14Now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'i14-execution', title: 'Synthetic I14 execution' });
  let releaseGate!: () => void;
  const gate = new Promise<void>(resolve => { releaseGate = resolve; });
  let rendererEntered = false;
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => I14_RUN_ID, now: i14Now,
    renderer: async () => { rendererEntered = true; await gate; return { semantic: {}, html: Buffer.from('<html><body>synthetic</body></html>') }; },
  });
  const scope = syntheticScope();
  try {
    await service.start(I14_WORKSPACE_ID, { contractVersion: 'research-automation-start-v1', requestKey: '44444444-4444-4444-8444-444444444444',
      mode: 'PRODUCT', keyword: 'synthetic', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: [...(options.reports ?? ['INSIGHT'])] });
    await service.processNext();
    const awaiting = await service.getRun(I14_WORKSPACE_ID, I14_RUN_ID);
    await service.confirmScope(I14_WORKSPACE_ID, I14_RUN_ID, { contractVersion: 'research-automation-confirm-v1', requestKey: '55555555-5555-4555-8555-555555555555',
      expectedRevision: awaiting.revision, definition: scope.definition, includeTerms: [...scope.includeTerms], excludeTerms: [], selectedProductIds: [], peerProductIds: [] });
    await service.processNext();
    const reportPromise = service.processNext();
    for (let attempt = 0; attempt < 200 && !rendererEntered; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    if (!rendererEntered) throw new Error('Synthetic REPORTS renderer did not enter its pause.');
    return {
      root, db, artifacts, service, scope, parent: { kind: 'INITIAL_REPORTS', runId: I14_RUN_ID }, reportPromise,
      release: releaseGate,
      async cleanup() { releaseGate(); await reportPromise.catch(() => {}); if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); },
    };
  } catch (error) {
    releaseGate();
    db.close();
    await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}
