import { createRequire } from 'node:module';
import collectionSchema from '../../../contracts/foundation/shopee-private-collection.schema.json' with { type: 'json' };
import rowsSchema from '../../../contracts/foundation/shopee-private-rows.schema.json' with { type: 'json' };
import projectionSchema from '../../../contracts/foundation/shopee-private-projection.schema.json' with { type: 'json' };
import exactSchema from '../../../contracts/foundation/shopee-exact-collection.schema.json' with { type: 'json' };
import legacySchema from '../../../contracts/foundation/shopee-collection.schema.json' with { type: 'json' };
import type { ShopeePrivateCollection } from '../../../contracts/foundation/shopee-private-collection.generated.js';
import type { ShopeePrivateRows } from '../../../contracts/foundation/shopee-private-rows.generated.js';
import type { ShopeePrivateProjection } from '../../../contracts/foundation/shopee-private-projection.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
ajv.addSchema(legacySchema, 'shopee-collection.schema.json');
ajv.addSchema(exactSchema, 'shopee-exact-collection.schema.json');
ajv.addSchema(collectionSchema, 'shopee-private-collection.schema.json');
ajv.addSchema(rowsSchema, 'shopee-private-rows.schema.json');
const collection = ajv.compile<ShopeePrivateCollection>({ $ref: 'shopee-private-collection.schema.json' });
const rows = ajv.compile<ShopeePrivateRows>({ $ref: 'shopee-private-rows.schema.json' });
const projection = ajv.compile<ShopeePrivateProjection>(projectionSchema);
const profile = ajv.compile<ShopeePrivateCollection['privacy']>({ $ref: 'shopee-private-collection.schema.json#/properties/privacy' });
export function validatePrivateCollection(value: unknown): ShopeePrivateCollection {
  if (!collection(value)) throw new TypeError('Invalid private Shopee collection'); return value;
}
export function validatePrivateRows(value: unknown): ShopeePrivateRows {
  if (!rows(value)) throw new TypeError('Invalid private Shopee rows'); return value;
}
export function validatePrivateProjection(value: unknown): ShopeePrivateProjection {
  if (!projection(value)) throw new TypeError('Invalid private Shopee projection'); return value;
}
export function validatePrivateProfile(value: unknown): ShopeePrivateCollection['privacy'] {
  if (!profile(value)) throw new TypeError('Unverified private Shopee field mapping'); return value;
}
