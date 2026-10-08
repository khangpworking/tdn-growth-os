import { createHash } from 'node:crypto';
import type { AutomationConfirmedSourceSet } from '../../../../contracts/analysis/automation-confirmed-source-set.generated.js';
import type { AutomationMetricSourceV2 } from '../../../../contracts/analysis/automation-metric-source-v2.generated.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import type { FinalizedSourcePackageReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { METRIC_CURRENT_HEADERS, normalizeMetricWorkbookInput, readMetricSheetRows } from '../metric-source-profile.js';
import type { AutomationMetricMethodBridge, MetricRunInput } from './metric-method-bridge.js';
import { ResearchAutomationIntegrityError } from './model.js';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const digest = (value: unknown) => hash(canonicalJson(value));
function fail(): never { throw new ResearchAutomationIntegrityError('Metric sales names differ from the confirmed workbook source.'); }

/** Read-only exact cells. The owning service supplies its authenticated frozen source set;
 * Foundation and the Metric bridge retain authority over bytes, upload origin and profile.
 * This projection neither calculates sales nor admits packages or changes source strings.
 */
export async function readMetricSalesNameEvidence(options: {
  artifacts: ContentAddressedArtifactStore;
  reader: FinalizedSourcePackageReader;
  authority: Pick<AutomationMetricMethodBridge, 'verifySelection' | 'inspectPrepared'>;
}, input: MetricRunInput, sources: AutomationConfirmedSourceSet, sourceSetDigest: string) {
  if (sources.metric.decision !== 'ADMITTED') return null;
  if (digest(sources) !== sourceSetDigest || sources.runId !== input.runId || sources.workspaceId !== input.start.workspaceId ||
      sources.scopeSha256 !== digest(input.scope) || sources.startSha256 !== digest(input.start) ||
      sources.confirmedAt !== input.scopeConfirmedAt || input.scope.runId !== input.runId || input.scope.workspaceId !== sources.workspaceId)
    fail();
  const sourceBytes = await options.artifacts.read(sourceSetDigest, { maxBytes: 8 * 1024 * 1024 });
  if (!sourceBytes.equals(Buffer.from(canonicalJson(sources)))) fail();
  const selected = sources.metric.sourcePackage;
  await options.authority.verifySelection({ ...input, sourceSelection: { executionId: sources.executionId, sourcePackage: selected } });
  const admitted = await options.authority.inspectPrepared(input, selected.packageId);
  if (canonicalJson(admitted) !== canonicalJson(selected)) fail();
  const retained = await options.reader.readFinalizedSourcePackage(selected.packageId, { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
  if (retained.packageId !== selected.packageId || retained.manifestArtifactSha256 !== selected.manifestArtifactSha256 ||
      retained.packageContentSha256 !== selected.packageContentSha256) fail();
  // Descriptor/profile/authored origin were checked by the owning bridge above.
  const descriptorFile = retained.files.find(file => file.path === 'normalized/automation-metric-source.json');
  if (!descriptorFile) fail();
  const descriptor = JSON.parse(descriptorFile.bytes.toString('utf8')) as AutomationMetricSourceV2;
  if (descriptor.contractVersion !== 'automation-metric-source-v2') fail();
  const workbook = retained.files.find(file => file.path === descriptor.workbookPath);
  if (!workbook || hash(workbook.bytes) !== workbook.sha256 || workbook.bytes.length !== workbook.byteSize) fail();
  const manifest = retained.files.find(file => file.path === descriptor.manifestPath);
  if (!manifest) fail();
  // The existing normalizer owns platform membership, including interleaved
  // combined exports. Never infer it from a filename or reproduce its ID rules.
  const selectedRows = new Set(normalizeMetricWorkbookInput(workbook.bytes, manifest.bytes).receipt.evidence.map(row => row.row));
  const rows = readMetricSheetRows(workbook.bytes);
  const header = rows[0];
  if (!header || header.row !== 1 || header.cells.some(cell => cell.type !== 'text') ||
      canonicalJson(header.cells.map(cell => cell.value)) !== canonicalJson(METRIC_CURRENT_HEADERS)) fail();
  const titleColumn = METRIC_CURRENT_HEADERS.indexOf('Tên sản phẩm');
  if (titleColumn !== 0 || rows.length < 2 || rows.some((row, index) => row.row !== index + 1)) fail();
  const names = rows.slice(1).filter(row => selectedRows.has(row.row)).map(row => {
    const cell = row.cells[titleColumn];
    if (!cell || cell.type !== 'text' || typeof cell.value !== 'string' || !cell.value.trim()) fail();
    return { name: cell.value, row: row.row, locator: `Sheet1!A${row.row}` };
  });
  if (names.length !== selectedRows.size) fail();
  return { sourcePackage: selected, workbook: { logicalPath: workbook.path, sha256: workbook.sha256, byteSize: workbook.byteSize }, names };
}
