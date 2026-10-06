import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { FinalizedSourcePackageReader } from '../../foundation/source-package-reader.js';
import type { VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { buildPackageLocatedInsightExtension } from '../report-located-insight-extension.js';
import { codeLiteralLocatedRecords, type LiteralLocatedRecordCoding } from './literal-review-coding.js';

type PackageIdentity = NonNullable<Parameters<typeof buildPackageLocatedInsightExtension>[1]>;
export interface SourcePackageLiteralReviewInput {
  sourcePackage: PackageIdentity;
  logicalPath: string;
}
export interface SourcePackageLiteralReviewDiagnostics {
  contractVersion: 'source-package-literal-review-diagnostics-v1';
  codingId: string;
  authorityState: 'RULE_PROPOSAL_ONLY';
  sourcePackage: PackageIdentity;
  descriptor: { logicalPath: string; sha256: string; byteSize: number };
  locatedOutputId: string;
  implementation: { parserSha256: string; adapterSha256: string; semanticsSha256: string };
  diagnostics: LiteralLocatedRecordCoding;
  limitations: string[];
}
const MAX_BYTES = 8 * 1024 * 1024;
const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export class SourcePackageLiteralReviewError extends TypeError {}
function fail(code: string): never { throw new SourcePackageLiteralReviewError(code); }

/**
 * Prepares diagnostics from an existing verified package. The caller retains
 * these files through Foundation; this adapter creates no collection or ledger.
 */
export async function buildSourcePackageLiteralReviewDiagnostics(
  input: SourcePackageLiteralReviewInput,
  sourcePackages: FinalizedSourcePackageReader,
  rulesBytes: Buffer,
): Promise<{ output: SourcePackageLiteralReviewDiagnostics; bytes: Buffer; files: Map<string, Buffer>; locatedOutput: LocatedInsightMethods }> {
  const inputJson = canonicalJson(input);
  if (Buffer.byteLength(inputJson) > MAX_BYTES) fail('SOURCE_PACKAGE_LITERAL_INPUT_TOO_LARGE');
  const frozen = JSON.parse(inputJson) as SourcePackageLiteralReviewInput;
  if (typeof frozen.logicalPath !== 'string' || frozen.logicalPath.length === 0) fail('SOURCE_PACKAGE_LITERAL_DESCRIPTOR_REQUIRED');
  if (!Buffer.isBuffer(rulesBytes) || rulesBytes.length > MAX_BYTES) fail('SOURCE_PACKAGE_LITERAL_RULE_BYTES_INVALID');
  const rules = Buffer.from(rulesBytes);
  const verified: { retained?: VerifiedFinalizedSourcePackage } = {};
  const extension = await buildPackageLocatedInsightExtension(frozen.logicalPath, frozen.sourcePackage, {
    readFinalizedSourcePackage: async (packageId, budget) => {
      const retained = await sourcePackages.readFinalizedSourcePackage(packageId, budget);
      verified.retained = retained;
      return retained;
    },
  });
  if (!extension) fail('SOURCE_PACKAGE_LITERAL_DESCRIPTOR_REQUIRED');
  const descriptor = verified.retained?.files.find(file => file.path === frozen.logicalPath);
  if (!descriptor) fail('SOURCE_PACKAGE_LITERAL_DESCRIPTOR_NOT_RETAINED');
  const diagnostics = codeLiteralLocatedRecords(extension.output.input, rules);
  const [parser, adapter, semantics, schema] = await Promise.all([
    fs.readFile(new URL('./literal-review-coding.ts', import.meta.url)),
    fs.readFile(new URL('./source-package-literal-review-adapter.ts', import.meta.url)),
    fs.readFile(new URL('../../../../docs/tasks/research-literal-review-coding-v1.md', import.meta.url)),
    fs.readFile(new URL('../../../../contracts/analysis/located-insight-methods.schema.json', import.meta.url)),
  ]);
  const body: Omit<SourcePackageLiteralReviewDiagnostics, 'codingId'> = {
    contractVersion: 'source-package-literal-review-diagnostics-v1', authorityState: 'RULE_PROPOSAL_ONLY',
    sourcePackage: frozen.sourcePackage,
    descriptor: { logicalPath: frozen.logicalPath, sha256: descriptor.sha256, byteSize: descriptor.byteSize },
    locatedOutputId: extension.output.methodOutputId,
    implementation: { parserSha256: sha(parser), adapterSha256: sha(adapter), semanticsSha256: sha(semantics) },
    diagnostics,
    limitations: [
      'SOURCE_PACKAGE_MEMBERSHIP_AND_TEXT_VERIFIED_NOT_PROVIDER_OR_AUTHOR_AUTHENTICITY',
      'SOURCE_DISPOSITIONS_ARE_DECLARED_NOT_NEW_CATEGORY_OR_LISTING_ADMISSION',
      'SOURCE_LOCATORS_NOT_UNIQUE_REVIEWERS_OR_RESOLVED_NATIVE_ID_CONFLICTS',
      'RULE_CANDIDATES_RETAINED_SEPARATELY_REPORT_ANNOTATIONS_EMPTY',
      'SOURCE_PACKAGE_RETAINS_NATIVE_CAPTURE_IDENTITIES_WITHOUT_ZEN_COLLECTION_PROJECTION',
      'PARSER_SOURCE_SNAPSHOT_IS_NOT_AN_EXECUTABLE_DEPENDENCY_OR_RUNTIME_ARCHIVE',
    ],
  };
  const output: SourcePackageLiteralReviewDiagnostics = { ...body, codingId: sha(canonicalJson(body)) };
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  const files = new Map<string, Buffer>([
    ['methods/literal-located-diagnostics.json', bytes],
    ['methods/located-insight-bundle.json', extension.bytes],
    ['rules/literal-review-rules.json', rules],
    ['rules/literal-review-parser.ts', parser],
    ['rules/source-package-literal-review-adapter.ts', adapter],
    ['rules/literal-review-semantics.md', semantics],
    ['profiles/located-insight-methods.schema.json', schema],
  ]);
  for (const file of files.values()) if (file.length > MAX_BYTES) fail('SOURCE_PACKAGE_LITERAL_DIAGNOSTICS_TOO_LARGE');
  return { output, bytes, files, locatedOutput: extension.output };
}
