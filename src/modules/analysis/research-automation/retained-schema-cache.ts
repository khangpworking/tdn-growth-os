import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;

interface RetainedSchemaProfile {
  readonly path: string;
  readonly id: string;
  readonly bytes: Uint8Array;
}
type Validators = Readonly<Record<string, (value: unknown) => boolean>>;

/** One successful compilation per owning hook, never a verified artifact or output cache.
 * The owner must authenticate every profile/source/member before each call and
 * still validate every output. Byte copies keep caller objects out of AJV state.
 */
export function createRetainedSchemaCache(policy: { readonly formats: boolean }): (profiles: readonly RetainedSchemaProfile[]) => Validators {
  const formats = policy.formats;
  let last: { readonly key: string; readonly validators: Validators } | undefined;
  return profiles => {
    const schemas = profiles.map(profile => {
      const bytes = Buffer.from(profile.bytes);
      const schema: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
          (schema as Record<string, unknown>).$id !== profile.id) throw new Error('Retained schema identity differs.');
      return { path: profile.path, id: profile.id, sha256: createHash('sha256').update(bytes).digest('hex'),
        schema: schema as Record<string, unknown> };
    });
    const key = JSON.stringify({ strict: true, allErrors: true, formats,
      profiles: schemas.map(({ path, id, sha256 }) => [path, id, sha256]) });
    if (last?.key === key) return last.validators;
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    if (formats) addFormats(ajv);
    for (const { schema } of schemas) ajv.addSchema(schema);
    const validators: Validators = Object.freeze(Object.fromEntries(schemas.map(({ id }) => {
      const validate = ajv.getSchema(id);
      if (!validate) throw new Error('Retained schema validator is missing.');
      // Expose booleans only, never shared AJV schemas, options or mutable errors.
      return [id, (value: unknown) => validate(value) === true];
    })));
    last = { key, validators };
    return validators;
  };
}
