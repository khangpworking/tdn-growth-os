import { createRequire } from 'node:module';
import snapshotSchema from '../../../../contracts/analysis/automation-bounded-method-snapshot.schema.json' with { type: 'json' };
import revisionSchema from '../../../../contracts/analysis/automation-bounded-report-revision.schema.json' with { type: 'json' };
import classifiedRevisionSchema from '../../../../contracts/analysis/automation-classified-report-revision.schema.json' with { type: 'json' };
import gateSchema from '../../../../contracts/analysis/bounded-analysis-gates.schema.json' with { type: 'json' };
import type { AutomationBoundedMethodSnapshot } from '../../../../contracts/analysis/automation-bounded-method-snapshot.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { FinalizedSourcePackageReader } from '../../foundation/source-package-reader.js';
import { buildVerifiedMethodPacketSources, ReportMethodPacketsExtensionError } from '../report-method-packets-extension.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema([gateSchema, classifiedRevisionSchema, revisionSchema, snapshotSchema]);
type Binding = AutomationBoundedMethodSnapshot['binding'];
type Selection = AutomationBoundedMethodSnapshot['selection'];
const snapshotValid = ajv.getSchema<AutomationBoundedMethodSnapshot>(snapshotSchema.$id)!;
const bindingValid = ajv.getSchema<Binding>(`${snapshotSchema.$id}#/$defs/binding`)!;
const selectionValid = ajv.getSchema<Selection>(`${revisionSchema.$id}#/$defs/selection`)!;
// Same explicit budget as the report method packet wrapper; the helper still caps each parsed file.
const READ_BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 } as const;
function fail(code: string): never { throw new ReportMethodPacketsExtensionError(code); }

/** Recomputes bounded gates from one exact finalized package descriptor. Source references verify literal
 * payloads only, not truth, period compatibility or approval. Decision claims are rejected, never admitted.
 * No database write and no latest-package lookup: the caller supplies the exact package identity. */
export async function buildAutomationBoundedMethods(selection: Selection, binding: Binding, reader: FinalizedSourcePackageReader): Promise<AutomationBoundedMethodSnapshot> {
  if (!selectionValid(selection)) fail('BOUNDED_METHOD_SELECTION_INVALID');
  if (!bindingValid(binding)) fail('BOUNDED_METHOD_BINDING_INVALID');
  const retained = await reader.readFinalizedSourcePackage(selection.packageId, READ_BUDGET);
  if (retained.packageId !== selection.packageId || retained.manifestArtifactSha256 !== selection.manifestArtifactSha256 ||
      retained.packageContentSha256 !== selection.packageContentSha256 || retained.manifest.packageId !== selection.packageId ||
      retained.manifest.packageContentSha256 !== selection.packageContentSha256) fail('BOUNDED_METHOD_PACKAGE_IDENTITY_MISMATCH');
  const { input, descriptor, gates } = buildVerifiedMethodPacketSources(selection.descriptorPath, retained);
  if (input.decisions !== null) fail('BOUNDED_METHOD_DECISIONS_NOT_ADMITTED');
  if (input.gates === null || gates === undefined) fail('BOUNDED_METHOD_GATES_REQUIRED');
  const snapshot: AutomationBoundedMethodSnapshot = {
    contractVersion: 'automation-bounded-method-snapshot-v1', binding: JSON.parse(canonicalJson(binding)) as Binding,
    selection: JSON.parse(canonicalJson(selection)) as Selection, descriptorSha256: descriptor.sha256, output: gates,
  };
  if (!snapshotValid(snapshot)) fail('BOUNDED_METHOD_SNAPSHOT_INVALID');
  return snapshot;
}

/** Replays a stored snapshot against the same exact package; any byte or derived difference is rejected. */
export async function verifyAutomationBoundedMethods(value: unknown, binding: Binding, selection: Selection, reader: FinalizedSourcePackageReader): Promise<AutomationBoundedMethodSnapshot> {
  if (!snapshotValid(value)) fail('BOUNDED_METHOD_SNAPSHOT_INVALID');
  const expected = await buildAutomationBoundedMethods(selection, binding, reader);
  if (canonicalJson(value) !== canonicalJson(expected)) fail('BOUNDED_METHOD_SNAPSHOT_REPLAY_MISMATCH');
  return expected;
}
