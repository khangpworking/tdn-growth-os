import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { FinalizedSourcePackageReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { buildLocatedInsightMethods } from '../located-insight-methods.js';
import { buildSourcePackageLiteralReviewDiagnostics, type SourcePackageLiteralReviewInput } from './source-package-literal-review-adapter.js';
import { projectLiteralReviewCandidates } from './literal-review-projection.js';

const POLICY_SHA256 = 'ba676c8e9e89f7ba0f05ec6157b82414524f6af48697900afe61ac7e0dc64f42';
const MAX_BYTES = 8 * 1024 * 1024;
const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`);
export class SourcePackageLiteralProjectionError extends TypeError {}

/** Prepares a separate adopted declaration overlay; original diagnostics and source files remain immutable. */
export async function buildSourcePackageLiteralReviewProjection(
  input: SourcePackageLiteralReviewInput,
  sourcePackages: FinalizedSourcePackageReader,
  rulesBytes: Buffer,
) {
  const prepared = await buildSourcePackageLiteralReviewDiagnostics(input, sourcePackages, rulesBytes);
  const [policyBytes, projectionSource, wrapperSource] = await Promise.all([
    fs.readFile(new URL('../../../../docs/research/literal-review-projection-policy-v1.json', import.meta.url)),
    fs.readFile(new URL('./literal-review-projection.ts', import.meta.url)),
    fs.readFile(new URL('./source-package-literal-review-projection.ts', import.meta.url)),
  ]);
  if (sha(policyBytes) !== POLICY_SHA256) throw new SourcePackageLiteralProjectionError('LITERAL_PROJECTION_POLICY_BYTES_MISMATCH');
  const policy = JSON.parse(policyBytes.toString('utf8')) as {
    policyRevision: 'literal-source-bound-v1'; authorityState: 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS';
    acceptanceTurnId: string; adoptionTurnId: string;
    acceptedTuple: { rulesSha256: string; parserSha256: string; adapterSha256: string; semanticsSha256: string };
  };
  const actualTuple = { rulesSha256: prepared.output.diagnostics.rules.sha256, ...prepared.output.implementation };
  if (canonicalJson(actualTuple) !== canonicalJson(policy.acceptedTuple))
    throw new SourcePackageLiteralProjectionError('LITERAL_PROJECTION_ACCEPTED_TUPLE_MISMATCH');
  const projection = projectLiteralReviewCandidates(prepared.locatedOutput.input, prepared.output.diagnostics);
  const descriptor = { ...prepared.locatedOutput.input, ...projection.candidates,
    adjudicationRule: 'Adopted literal-source-bound-v1 declarations only; affected pending readings excluded. Partial coding, not verified truth or completed sections.' };
  const located = buildLocatedInsightMethods(descriptor);
  const body = {
    contractVersion: 'source-package-literal-declaration-projection-v1' as const,
    authorityState: policy.authorityState, policyRevision: policy.policyRevision,
    policySha256: POLICY_SHA256, acceptanceTurnId: policy.acceptanceTurnId, adoptionTurnId: policy.adoptionTurnId,
    acceptedTuple: actualTuple, sourcePackage: prepared.output.sourcePackage, descriptor: prepared.output.descriptor,
    codingId: prepared.output.codingId, codingSha256: sha(prepared.bytes),
    implementation: { projectionSha256: sha(projectionSource), wrapperSha256: sha(wrapperSource) },
    projection, output: located.output,
    sectionState: 'PARTIAL' as const,
    limitations: [
      'DECLARED_SOURCE_BOUND_READINGS_NOT_AUTHENTICATED_BEHAVIOR_OR_SEMANTIC_TRUTH',
      'PENDING_SIDECAR_REMAINS_REQUIRED_EVEN_WHEN_LOCATED_SUMMARY_HAS_NO_BLOCKER',
      'SOURCE_LOCATED_RECORD_AND_SPAN_COUNTS_NOT_UNIQUE_PEOPLE_PREVALENCE_OR_ACCURACY',
      'NO_FINAL_CODE_RATIOS_OR_SECTION_COMPLETION_WHILE_CODING_INCOMPLETE',
      'NO_CATEGORY_ANNUAL_SOURCE_AUTHENTICATION_OR_FINAL_REPORT_APPROVAL',
      'EMPTY_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS',
      'RETAINED_CODE_BYTES_ARE_NOT_AN_EXECUTABLE_RUNTIME_ARCHIVE',
    ],
  };
  const output = { ...body, projectionId: sha(canonicalJson(body)) };
  const bytes = json(output);
  const files = new Map(prepared.files);
  files.set('methods/literal-declaration-projection.json', bytes);
  files.set('methods/literal-declaration-input.json', json(descriptor));
  files.set('methods/literal-declaration-output.json', located.bytes);
  files.set('authority/literal-review-projection-policy-v1.json', policyBytes);
  files.set('rules/literal-review-projection.ts', projectionSource);
  files.set('rules/source-package-literal-review-projection.ts', wrapperSource);
  for (const file of files.values()) if (file.length > MAX_BYTES)
    throw new SourcePackageLiteralProjectionError('LITERAL_PROJECTION_FILE_TOO_LARGE');
  return { output, bytes, files, locatedOutput: located.output, diagnostics: prepared.output };
}
