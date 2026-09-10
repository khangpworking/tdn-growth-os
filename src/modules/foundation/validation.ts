import { createRequire } from 'node:module';
import sourcePackageRequestSchema from '../../../contracts/foundation/source-package-intake-request.schema.json' with { type: 'json' };
import sourcePackageManifestSchema from '../../../contracts/foundation/source-package-manifest.schema.json' with { type: 'json' };
import type { SourcePackageIntakeRequest } from '../../../contracts/foundation/source-package-intake-request.generated.js';
import type { SourcePackageManifest } from '../../../contracts/foundation/source-package-manifest.generated.js';
import researchDocumentImportSchema from '../../../contracts/foundation/research-document-import.schema.json' with { type: 'json' };
import type { ResearchDocumentImport } from '../../../contracts/foundation/research-document-import.generated.js';
import researchPackManifestSchema from '../../../contracts/foundation/research-pack-manifest.schema.json' with { type: 'json' };
import type { ResearchPackManifest } from '../../../contracts/foundation/research-pack-manifest.generated.js';
import researchPackRequestSchema from '../../../contracts/foundation/research-pack-request.schema.json' with { type: 'json' };
import type { ResearchPackRequest } from '../../../contracts/foundation/research-pack-request.generated.js';
import manifestSchema from '../../../contracts/foundation/data-pack-manifest.schema.json' with { type: 'json' };
import type { DataPackManifest } from '../../../contracts/foundation/data-pack-manifest.generated.js';
import requestSchema from '../../../contracts/foundation/data-pack-request.schema.json' with { type: 'json' };
import type { DataPackRequest } from '../../../contracts/foundation/data-pack-request.generated.js';
import exportSchema from '../../../contracts/foundation/json-export.schema.json' with { type: 'json' };
import type { JsonExportInput } from '../../../contracts/foundation/json-export.generated.js';
import manualSchema from '../../../contracts/foundation/manual-observation.schema.json' with { type: 'json' };
import type { ManualObservationInput } from '../../../contracts/foundation/manual-observation.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(sourcePackageRequestSchema);
const validateSourcePackageRequestContract = ajv.getSchema<SourcePackageIntakeRequest>(sourcePackageRequestSchema.$id)!;
const validateSourcePackageManifestContract = ajv.compile(sourcePackageManifestSchema);
const validateManual = ajv.compile(manualSchema);
const validateExport = ajv.compile(exportSchema);
const validatePackRequest = ajv.compile(requestSchema);
const validatePackManifest = ajv.compile(manifestSchema);
const validateResearchDocumentImportContract = ajv.compile(researchDocumentImportSchema);
const validateResearchPackRequestContract = ajv.compile(researchPackRequestSchema);
const validateResearchPackManifestContract = ajv.compile(researchPackManifestSchema);

export class FoundationValidationError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`Invalid manual observation input: ${details}`);
    this.details = details;
  }
}

export function validateManualObservationInput(value: unknown): ManualObservationInput {
  if (!validateManual(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateManual.errors, { separator: '; ' }));
  }
  const input = value as unknown as ManualObservationInput;
  assertPeriodOrder(
    input.observation.period.start,
    input.observation.period.end,
    'observation.period.start must not be after observation.period.end',
  );
  return input;
}

export function validateDataPackRequest(value: unknown): DataPackRequest {
  if (!validatePackRequest(value)) {
    throw new FoundationValidationError(ajv.errorsText(validatePackRequest.errors, { separator: '; ' }));
  }
  return value as unknown as DataPackRequest;
}

export function validateDataPackManifest(value: unknown): DataPackManifest {
  if (!validatePackManifest(value)) {
    throw new FoundationValidationError(ajv.errorsText(validatePackManifest.errors, { separator: '; ' }));
  }
  return value as unknown as DataPackManifest;
}

export function validateJsonExportInput(value: unknown): JsonExportInput {
  if (!validateExport(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateExport.errors, { separator: '; ' }));
  }
  const input = value as unknown as JsonExportInput;
  assertPeriodOrder(input.period.start, input.period.end, 'period.start must not be after period.end');
  return input;
}

function assertPeriodOrder(start: string, end: string, message: string): void {
  const periodStart = Date.parse(start);
  const periodEnd = Date.parse(end);
  if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodStart > periodEnd) {
    throw new FoundationValidationError(message);
  }
}

export function validateResearchDocumentImport(value: unknown): ResearchDocumentImport {
  if (!validateResearchDocumentImportContract(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateResearchDocumentImportContract.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchDocumentImport;
}

export function validateResearchPackRequest(value: unknown): ResearchPackRequest {
  if (!validateResearchPackRequestContract(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateResearchPackRequestContract.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchPackRequest;
}

export function validateResearchPackManifest(value: unknown): ResearchPackManifest {
  if (!validateResearchPackManifestContract(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateResearchPackManifestContract.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchPackManifest;
}

export function validateSourcePackageIntakeRequest(value: unknown): SourcePackageIntakeRequest {
  if (!validateSourcePackageRequestContract(value)) {
    throw new FoundationValidationError(
      ajv.errorsText(validateSourcePackageRequestContract.errors, { separator: '; ' }),
    );
  }
  const input = value as SourcePackageIntakeRequest;
  validateSourcePackageFiles(input.files);
  return input;
}

export function validateSourcePackageManifest(value: unknown): SourcePackageManifest {
  if (!validateSourcePackageManifestContract(value)) {
    throw new FoundationValidationError(
      ajv.errorsText(validateSourcePackageManifestContract.errors, { separator: '; ' }),
    );
  }
  const manifest = value as unknown as SourcePackageManifest;
  validateSourcePackageFiles(manifest.files);
  return manifest;
}

function validateSourcePackageFiles(
  files: SourcePackageIntakeRequest['files'] | SourcePackageManifest['files'],
): void {
  const paths = files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) {
    throw new FoundationValidationError('Source package file paths must be unique');
  }
  for (const file of files) {
    if (file.period) {
      const start = Date.parse(file.period.start);
      const end = Date.parse(file.period.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
        throw new FoundationValidationError(`Invalid period for ${file.path}`);
      }
    }
    if (
      (file.representationRole === 'structured' || file.representationRole === 'derived') &&
      file.independence !== 'non_independent'
    ) {
      throw new FoundationValidationError(
        `Structured/derived representation must be non-independent: ${file.path}`,
      );
    }
  }
}
