import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { DescriptiveMarketMethods } from '../contracts/analysis/descriptive-market-methods.generated.js';
import type { ReportAssemblySnapshot } from '../contracts/analysis/report-assembly-snapshot.generated.js';
import type { ResearchChartSpec } from '../contracts/analysis/research-chart-spec.generated.js';
import type { SourcePackageManifest } from '../contracts/foundation/source-package-manifest.generated.js';
import type { ResearchReportChartData } from '../src/modules/analysis/research-report-charts.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import {
  FLINT_PACKAGE,
  auditReportFlint,
  reportFlintSectionsFromAssemblySnapshot,
  type FlintAssemblerSet,
  type ReportFlintAuditRequest,
  type ReportFlintSourcePins,
} from '../src/modules/analysis/report-flint-audit.js';

const usage = 'Usage: tsx scripts/audit-report-flint.ts <report-dir> <flint-package-dir> <receipt-path> [assembly-snapshot.json] [descriptive-market-methods.json]';

function fail(message: string): never {
  console.error(message);
  console.error(usage);
  process.exit(2);
}

const [reportDirArg, flintDirArg, outputArg, snapshotArg, descriptiveArg] = process.argv.slice(2);
if (!reportDirArg || !flintDirArg || !outputArg) fail('Missing required arguments');

const reportDir = resolve(reportDirArg);
const flintDir = resolve(flintDirArg);
const outputPath = isAbsolute(outputArg) ? outputArg : resolve(outputArg);
const read = (name: string): Buffer => {
  const path = join(reportDir, name);
  if (!existsSync(path)) fail(`Missing report artifact: ${name}`);
  return readFileSync(path);
};
const parse = <T>(bytes: Buffer, name: string): T => {
  try { return JSON.parse(bytes.toString('utf8')) as T; }
  catch (error) { fail(`Invalid JSON in ${name}: ${error instanceof Error ? error.message : String(error)}`); }
};
const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const digestPattern = /^[0-9a-f]{64}$/;

function assertDigest(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !digestPattern.test(value)) fail(`${label} is not a lowercase SHA-256 digest`);
}

function verifyAssemblySnapshot(snapshot: ReportAssemblySnapshot): void {
  assertDigest(snapshot.assemblySha256, 'assembly snapshot assemblySha256');
  const { assemblySha256, ...content } = snapshot;
  const calculated = sha256(Buffer.from(canonicalJson(content), 'utf8'));
  if (calculated !== assemblySha256) {
    fail(`Assembly snapshot payload does not match assemblySha256 (supplied snapshot is not verified)`);
  }
  // readinessSha256 is an identity from the upstream A31 result. The snapshot
  // carries it, but not the complete A31 input/evidence collection needed to
  // recompute that hash here, so keep it as a supplied upstream identity.
  assertDigest(snapshot.readinessSha256, 'assembly snapshot readinessSha256');
}

function packageContentDigest(manifest: SourcePackageManifest): string {
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('Source package manifest has no retained file membership to verify packageContentSha256');
  }
  const membership = manifest.files
    .map(({ path, sha256: fileSha256, byteSize }) => ({ path, sha256: fileSha256, byteSize }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return sha256(Buffer.from(canonicalJson(membership), 'utf8'));
}

const chartDataBytes = read('charts.json');
const chartSpecBytes = read('chart-spec.json');
const normalizedInputBytes = read('normalized-input.json');
const metricResultBytes = read('metric-result.json');
const catalogBytes = read('section-catalog.json');
const packetBytes = read('packet.json');
const chartData = parse<ResearchReportChartData>(chartDataBytes, 'charts.json');
const chartSpec = parse<ResearchChartSpec>(chartSpecBytes, 'chart-spec.json');

let snapshot: ReportAssemblySnapshot | undefined;
if (snapshotArg) {
  snapshot = parse<ReportAssemblySnapshot>(readFileSync(resolve(snapshotArg)), snapshotArg);
  verifyAssemblySnapshot(snapshot);
}

let descriptiveMethods: DescriptiveMarketMethods | undefined;
if (descriptiveArg) descriptiveMethods = parse<DescriptiveMarketMethods>(readFileSync(resolve(descriptiveArg)), descriptiveArg);

const artifactEnvelope = existsSync(join(reportDir, 'evidence-envelope.json'))
  ? parse<{ artifacts?: Record<string, string>; sourcePackage?: { packageContentSha256?: string } }>(read('evidence-envelope.json'), 'evidence-envelope.json') : {};
const artifact = artifactEnvelope.artifacts ?? {};
const digestOrFile = (artifactKey: string, fileName: string): string => {
  const actual = sha256(read(fileName));
  const pinned = artifact[artifactKey];
  if (pinned !== undefined && (typeof pinned !== 'string' || pinned !== actual)) {
    fail(`Evidence envelope digest mismatch for ${artifactKey}: ${fileName}`);
  }
  return actual;
};
const receipt = existsSync(join(reportDir, 'receipt.json'))
  ? parse<{ inputSha256?: string }>(read('receipt.json'), 'receipt.json') : {};
const sourcePackageManifestBytes = read('source-package-manifest.json');
const sourcePackageManifest = parse<SourcePackageManifest>(sourcePackageManifestBytes, 'source-package-manifest.json');
const derivedSourcePackageContentSha256 = packageContentDigest(sourcePackageManifest);
assertDigest(sourcePackageManifest.packageContentSha256, 'source-package-manifest packageContentSha256');
if (sourcePackageManifest.packageContentSha256 !== derivedSourcePackageContentSha256) {
  fail('Source package content identity cannot be verified from the retained source-package-manifest.json membership');
}
const envelopeSourcePackageContentSha256 = artifactEnvelope.sourcePackage?.packageContentSha256;
assertDigest(envelopeSourcePackageContentSha256, 'evidence envelope sourcePackage.packageContentSha256');
if (envelopeSourcePackageContentSha256 !== derivedSourcePackageContentSha256) {
  fail('Evidence envelope sourcePackage.packageContentSha256 does not match the retained source-package-manifest.json membership');
}
if (typeof receipt.inputSha256 !== 'string') fail('receipt.json must retain normalized input valueSha256 as inputSha256');
assertDigest(receipt.inputSha256, 'receipt inputSha256');
const sourcePins: ReportFlintSourcePins = {
  workspaceSnapshotSha256: digestOrFile('workspaceSnapshotSha256', 'workspace.json'),
  sourcePackageManifestSha256: digestOrFile('sourcePackageManifestSha256', 'source-package-manifest.json'),
  sourcePackageContentSha256: derivedSourcePackageContentSha256,
  normalizedInputArtifactSha256: digestOrFile('normalizedInputSha256', 'normalized-input.json'),
  normalizedInputValueSha256: receipt.inputSha256,
  metricResultSha256: digestOrFile('metricResultSha256', 'metric-result.json'),
  catalogSha256: digestOrFile('catalogSha256', 'section-catalog.json'),
  packetSha256: digestOrFile('packetSha256', 'packet.json'),
  chartDataSha256: digestOrFile('chartSha256', 'charts.json'),
  chartSpecSha256: digestOrFile('chartSpecSha256', 'chart-spec.json'),
  assemblySha256: snapshot?.assemblySha256 ?? null,
  readinessSha256: snapshot?.readinessSha256 ?? null,
  descriptiveMethodOutputId: descriptiveMethods?.methodOutputId ?? null,
};
if (snapshot !== undefined) {
  const snapshotPins: readonly [string, string, string][] = [
    ['workspaceSnapshotSha256', snapshot.source.workspaceSnapshotSha256, sourcePins.workspaceSnapshotSha256],
    ['sourcePackageManifestSha256', snapshot.source.sourcePackageManifestSha256, sourcePins.sourcePackageManifestSha256],
    ['sourcePackageContentSha256', snapshot.source.sourcePackageContentSha256, sourcePins.sourcePackageContentSha256],
    ['normalizedInputArtifactSha256', snapshot.source.normalizedInputArtifactSha256, sourcePins.normalizedInputArtifactSha256],
    ['normalizedInputValueSha256', snapshot.source.normalizedInputValueSha256, sourcePins.normalizedInputValueSha256],
    ['catalogSha256', snapshot.catalog.sha256, sourcePins.catalogSha256],
  ];
  for (const [label, supplied, retained] of snapshotPins) {
    if (supplied !== retained) fail(`Assembly snapshot ${label} does not match retained report provenance`);
  }
}

const sections = snapshot === undefined ? [
  { sectionId: 'M03', readinessState: 'UNKNOWN' as const, deliveryState: 'UNKNOWN' as const, materialized: false, sectionSha256: null, blockers: ['ASSEMBLY_SNAPSHOT_REQUIRED'] },
  { sectionId: 'M04', readinessState: 'UNKNOWN' as const, deliveryState: 'UNKNOWN' as const, materialized: false, sectionSha256: null, blockers: ['ASSEMBLY_SNAPSHOT_REQUIRED'] },
  { sectionId: 'M05', readinessState: 'UNKNOWN' as const, deliveryState: 'UNKNOWN' as const, materialized: false, sectionSha256: null, blockers: ['ASSEMBLY_SNAPSHOT_REQUIRED'] },
] : reportFlintSectionsFromAssemblySnapshot(snapshot);

const request: ReportFlintAuditRequest = descriptiveMethods === undefined ? {
  chartData, chartDataBytes, chartSpec, chartSpecBytes, normalizedInputBytes, metricResultBytes, catalogBytes, packetBytes,
  sourcePins, sections,
} : {
  chartData, chartDataBytes, chartSpec, chartSpecBytes, normalizedInputBytes, metricResultBytes, catalogBytes, packetBytes,
  sourcePins, sections, descriptiveMethods,
};

const requireFromFlint = createRequire(join(flintDir, 'package.json'));
const flintPackageBytes = readFileSync(join(flintDir, 'package.json'));
const flintPackage = parse<{ name?: string; version?: string; gitHead?: string }>(flintPackageBytes, 'flint-chart/package.json');
if (flintPackage.name !== FLINT_PACKAGE.name || flintPackage.version !== FLINT_PACKAGE.version) {
  fail(`Unsupported Flint package: ${flintPackage.name ?? 'unknown'}@${flintPackage.version ?? 'unknown'}`);
}
if (flintPackage.gitHead !== undefined && flintPackage.gitHead !== FLINT_PACKAGE.npmGitHead) {
  fail(`Unsupported Flint git head: ${flintPackage.gitHead}`);
}
const installedGitHead = flintPackage.gitHead ?? null;
const gitHeadVerification = installedGitHead === null ? 'NOT_PRESENT' as const : 'VERIFIED' as const;
let flint: Record<string, unknown>;
try { flint = requireFromFlint(join(flintDir, 'dist', 'index.cjs')) as Record<string, unknown>; }
catch (error) { fail(`Cannot load isolated Flint package: ${error instanceof Error ? error.message : String(error)}`); }
const assembler = (name: string): ((input: unknown) => unknown) => {
  const value = flint[name];
  if (typeof value !== 'function') fail(`Flint assembler is unavailable: ${name}`);
  return value as (input: unknown) => unknown;
};
const assemblers: FlintAssemblerSet = {
  runtime: { name: flintPackage.name!, version: flintPackage.version!, ...(installedGitHead === null ? {} : { npmGitHead: installedGitHead }) },
  assembleVegaLite: input => assembler('assembleVegaLite')(input),
  assembleECharts: input => assembler('assembleECharts')(input),
  assembleChartjs: input => assembler('assembleChartjs')(input),
  assemblePlotly: input => assembler('assemblePlotly')(input),
};

if (existsSync(outputPath)) fail(`Refusing to overwrite an existing file: ${outputPath}`);
const outputDirectory = dirname(outputPath);
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
const outputDirectoryMode = statSync(outputDirectory).mode & 0o777;
if (outputDirectoryMode !== 0o700) {
  fail(`Refusing a non-private output directory (expected mode 0700): ${outputDirectory}`);
}
const audited = auditReportFlint(request, assemblers);
const cliLimitations = [
  'CLI_SOURCE_PACKAGE_CONTENT_IDENTITY_REDERIVED_FROM_RETAINED_MANIFEST_MEMBERSHIP;_RAW_PACKAGE_MEMBER_BYTES_ARE_NOT_RETAINED_HERE',
  ...(snapshot === undefined ? [] : ['CLI_ASSEMBLY_SNAPSHOT_PAYLOAD_HASH_RECOMPUTED;_A31_READINESS_HASH_REMAINS_SUPPLIED_FROM_THE_SNAPSHOT']),
];
const truthfulRuntime = {
  name: flintPackage.name!,
  version: flintPackage.version!,
  npmGitHead: installedGitHead,
  gitHeadVerification,
  packageJsonSha256: sha256(flintPackageBytes),
};
const result = {
  receipt: { ...audited.receipt, runtime: truthfulRuntime, limitations: [...audited.receipt.limitations, ...cliLimitations] },
  bytes: Buffer.from(`${canonicalJson({ ...audited.receipt, runtime: truthfulRuntime, limitations: [...audited.receipt.limitations, ...cliLimitations] })}\n`, 'utf8'),
};
writeFileSync(outputPath, result.bytes, { flag: 'wx', mode: 0o600 });
chmodSync(outputPath, 0o600);
if ((statSync(outputPath).mode & 0o777) !== 0o600) {
  fail(`Audit receipt was not written with private mode 0600: ${outputPath}`);
}
console.log(JSON.stringify({ status: result.receipt.status, outputPath, variants: result.receipt.variants.map(item => ({ variantId: item.variantId, state: item.state })) }));
if (result.receipt.status === 'REJECTED') process.exitCode = 1;
else if (result.receipt.status === 'BLOCKED') process.exitCode = 2;
