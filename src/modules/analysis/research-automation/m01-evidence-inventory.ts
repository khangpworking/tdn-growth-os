import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-m01-evidence-inventory.schema.json' with { type: 'json' };
import type { AutomationM01EvidenceInventory, InventoryItem } from '../../../../contracts/analysis/automation-m01-evidence-inventory.generated.js';
import type { ScopeSnapshot } from './model.js';
import { validateAutomationSourceClaims, type AutomationSourceClaim } from './source-claims.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile<AutomationM01EvidenceInventory>(schema);

export const MAX_M01_EVIDENCE_INVENTORY_BYTES = 64 * 1024 * 1024;
/** Report catalog order of the upstream claim sections; it is not a priority. */
const SECTION_ORDER = ['M05', 'I02', 'I04'] as const;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export class AutomationM01EvidenceInventoryValidationError extends TypeError {}
function fail(code: string): never { throw new AutomationM01EvidenceInventoryValidationError(code); }

export interface AutomationM01EvidenceInventoryInput {
  readonly run: { readonly runId: string; readonly workspaceId: string };
  /** The exact frozen scope snapshot. Its digest is computed here; callers cannot author a scope hash. */
  readonly scope: ScopeSnapshot;
  /** `claimsSha256` of the exact source-claims artifact the owning service replayed. */
  readonly claimsSha256: string;
  /** Untrusted retained source-claims artifact; it is fully revalidated before use. */
  readonly sourceClaims: unknown;
  /** U-02: opt-in inventory version. Absence retains the historical 1.0.0 limitation text and exact bytes. */
  readonly inventoryVersion?: '1.0.0' | '1.1.0';
}

/** A reference to one upstream claim with its bindings; never a new M01 fact. Spans and statements stay upstream. */
function item(claim: AutomationSourceClaim): InventoryItem {
  const { observation, source } = claim;
  return {
    claimId: claim.claimId, sectionId: claim.sectionId, basis: observation.basis,
    evidenceKind: observation.basis === 'DECLARED' ? 'SELF_REPORTED_DECLARATION' : 'SOURCE_OBSERVATION',
    state: observation.state, method: claim.method,
    source: { package: source.package, logicalPath: source.logicalPath, sha256: source.sha256, locator: source.locator,
      recordLocator: source.recordLocator, attribution: source.attribution },
    measure: observation.measure, value: observation.value, unit: observation.unit, precision: observation.precision,
    period: observation.period, periodText: observation.periodText, scope: observation.scope, coverage: observation.coverage,
    declaration: claim.declaration, observationLimitations: observation.limitations, claimLimitations: claim.limitations,
  };
}

/** Build the unranked M01 inventory of eligible upstream claims. No AI, ranking, objective or conclusion is produced. */
export function buildAutomationM01EvidenceInventory(input: AutomationM01EvidenceInventoryInput): { readonly artifact: AutomationM01EvidenceInventory; readonly bytes: Buffer } {
  if (!input.scope || input.scope.runId !== input.run.runId || input.scope.workspaceId !== input.run.workspaceId) fail('RUN_SCOPE_IDENTITY_MISMATCH');
  const claims = validateAutomationSourceClaims(input.sourceClaims);
  if (claims.runId !== input.run.runId) fail('RUN_IDENTITY_MISMATCH');
  if (claims.workspaceId !== input.run.workspaceId) fail('WORKSPACE_IDENTITY_MISMATCH');
  if (claims.scopeSha256 !== sha256(canonicalJson(input.scope))) fail('SCOPE_IDENTITY_MISMATCH');
  if (claims.claimsSha256 !== input.claimsSha256) fail('CLAIMS_IDENTITY_MISMATCH');
  // Group by catalog section only; within a section the upstream artifact order is kept unchanged.
  const items = SECTION_ORDER.flatMap((sectionId) => claims.claims.filter((claim) => claim.sectionId === sectionId).map(item));
  const inventoryVersion = input.inventoryVersion ?? '1.0.0';
  const artifact: AutomationM01EvidenceInventory = {
    contractVersion: '1.0.0', methodId: 'automation-m01-evidence-inventory', methodVersion: inventoryVersion, sectionId: 'M01',
    runId: claims.runId, workspaceId: claims.workspaceId, scopeSha256: claims.scopeSha256,
    sourceClaims: { methodId: claims.methodId, methodVersion: claims.methodVersion, claimsSha256: claims.claimsSha256 },
    ownerQuestion: { state: 'UNSET', text: null },
    ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED',
    status: items.length === 0 ? 'INSUFFICIENT_EVIDENCE' : 'UNRANKED_INVENTORY',
    insufficientEvidence: items.length === 0 ? 'NO_ELIGIBLE_UPSTREAM_CLAIMS' : null,
    conclusion: null,
    items,
    limitations: [
      'M01_ITEMS_REFERENCE_UPSTREAM_CLAIMS_AND_ARE_NOT_NEW_M01_FACTS',
      inventoryVersion === '1.1.0'
        ? 'OWNER_QUESTION_ABSENT_AI_PROPOSED_WORKING_QUESTION_AWAITS_OWNER_NO_RELEVANCE_SELECTION_OR_BUSINESS_OBJECTIVE'
        : 'OWNER_QUESTION_UNSET_NO_RELEVANCE_SELECTION_OR_BUSINESS_OBJECTIVE',
      'CATALOG_SECTION_ORDER_AND_UPSTREAM_ARTIFACT_ORDER_ARE_NOT_PRIORITY_OR_RANK',
      'NO_CONCLUSION_STRATEGY_OR_ACTION_IS_GENERATED',
      'DECLARATIONS_ARE_ATTRIBUTED_SELF_REPORT_NOT_AUTHENTICATED_TRUTH',
      'EMPTY_COUNTEREVIDENCE_MEMBERSHIP_DOES_NOT_ESTABLISH_ABSENCE_OF_COUNTEREVIDENCE',
      'REQUESTED_DATE_WINDOW_IS_NOT_ASSUMED_TO_BE_THE_OBSERVED_PERIOD',
      'ONLY_THE_BOUND_SOURCE_CLAIMS_ARTIFACT_IS_INVENTORIED',
      'NO_AI_OR_PROVIDER_CALL_WAS_MADE',
    ],
  };
  if (!validateSchema(artifact)) fail(`INVALID_M01_EVIDENCE_INVENTORY:${ajv.errorsText(validateSchema.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(artifact)}\n`, 'utf8');
  if (bytes.length > MAX_M01_EVIDENCE_INVENTORY_BYTES) fail('M01_EVIDENCE_INVENTORY_TOO_LARGE');
  return { artifact: JSON.parse(canonicalJson(artifact)) as AutomationM01EvidenceInventory, bytes };
}

/** Replay a retained M01 inventory against the exact claims it must have been built from. */
export function verifyAutomationM01EvidenceInventory(untrusted: unknown, input: AutomationM01EvidenceInventoryInput): AutomationM01EvidenceInventory {
  if (!validateSchema(untrusted)) fail(`INVALID_M01_EVIDENCE_INVENTORY:${ajv.errorsText(validateSchema.errors)}`);
  const expected = buildAutomationM01EvidenceInventory(input).artifact;
  if (canonicalJson(untrusted) !== canonicalJson(expected)) fail('M01_EVIDENCE_INVENTORY_REPLAY_MISMATCH');
  return expected;
}
