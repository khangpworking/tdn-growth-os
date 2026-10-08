import { createRequire } from 'node:module';
import type { Ajv2020 as AjvType } from 'ajv/dist/2020.js';
import legacy from '../../../../contracts/foundation/shopee-collection.schema.json' with { type: 'json' };
import collection from '../../../../contracts/foundation/shopee-private-collection.schema.json' with { type: 'json' };
import rows from '../../../../contracts/foundation/shopee-private-rows.schema.json' with { type: 'json' };
import projection from '../../../../contracts/foundation/shopee-private-projection.schema.json' with { type: 'json' };
import marker from '../../../../contracts/analysis/automation-private-shopee-source.schema.json' with { type: 'json' };
import corpus from '../../../../contracts/analysis/research-private-review-corpus.schema.json' with { type: 'json' };
import view from '../../../../contracts/analysis/private-review-report-view.schema.json' with { type: 'json' };
import type { AutomationPrivateShopeeSource } from '../../../../contracts/analysis/automation-private-shopee-source.generated.js';
import type { ResearchPrivateReviewCorpus } from '../../../../contracts/analysis/research-private-review-corpus.generated.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';

/** The same canonical dependencies are used at the service/source trust boundaries. */
export function registerPrivateReviewSchemas(ajv: AjvType): void {
  for (const [schema, id] of [[legacy, 'foundation/shopee-collection'], [collection, 'foundation/shopee-private-collection'],
    [rows, 'foundation/shopee-private-rows'], [projection, 'foundation/shopee-private-projection'],
    [marker, 'analysis/automation-private-shopee-source'], [corpus, 'analysis/research-private-review-corpus'],
    [view, 'analysis/private-review-report-view']] as const) {
    const uri = `https://tdn.local/contracts/${id}.schema.json`;
    if (!ajv.getSchema(uri)) ajv.addSchema(schema, uri);
  }
}
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
registerPrivateReviewSchemas(ajv);
const validateMarker = ajv.compile<AutomationPrivateShopeeSource>({ $ref: marker.$id });
const validateCorpus = ajv.compile<ResearchPrivateReviewCorpus>({ $ref: corpus.$id });
const validateView = ajv.compile<PrivateReviewReportView>({ $ref: view.$id });
export function privateShopeeMarker(value: unknown): AutomationPrivateShopeeSource {
  if (!validateMarker(value)) throw new TypeError('Invalid explicit private Shopee marker');
  return value;
}
export function privateReviewCorpus(value: unknown): ResearchPrivateReviewCorpus {
  if (!validateCorpus(value)) throw new TypeError('Invalid retained private review corpus');
  return value;
}
export function privateReviewReportView(value: unknown): PrivateReviewReportView {
  if (!validateView(value)) throw new TypeError('Invalid private review report view');
  return value;
}
