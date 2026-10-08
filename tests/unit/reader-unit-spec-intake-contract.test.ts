import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import readerSchema from '../../contracts/api/research-automation-reader-report-api.schema.json' with { type: 'json' };
import inputSchema from '../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import apiSchema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import peerSchema from '../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
for (const schema of [peerSchema, apiSchema, inputSchema, readerSchema]) ajv.addSchema(schema);
const valid = (name: string, value: unknown) => ajv.getSchema(`${readerSchema.$id}#/$defs/${name}`)!(value);

test('intake canonical contract binds new envelope without altering historical buildRequest', () => {
  const baseSchema = JSON.parse(execFileSync('git', ['show', '1c58d2532f254ec476ef71879cf589400d106927:contracts/api/research-automation-reader-report-api.schema.json'], { encoding: 'utf8' }));
  assert.deepEqual(readerSchema.$defs.buildRequest, baseSchema.$defs.buildRequest);
  const input = sync1ReaderFixture('1.4.0');
  const packet = unitPriceFixture(input.rows).packet;
  const request = { contractVersion: 'reader-report-build-v1.2', requestKey: '11111111-1111-4111-8111-111111111111',
    metricPackageId: '22222222-2222-4222-8222-222222222222', platforms: input.platforms, profile: input.profile, source: input.source, cover: null, unitPrices: packet };
  assert.equal(valid('buildRequest', request), true);
  const envelope = { contractVersion: 'reader-report-unit-spec-build-v1', intakeSha256: 'a'.repeat(64), request };
  assert.equal(valid('buildSubmission', envelope), true);
  assert.equal(valid('buildRequest', envelope), false, 'old contract does not silently adopt new semantics');
  assert.equal(valid('buildSubmission', { ...envelope, request: { ...request, contractVersion: 'reader-report-build-v1' } }), false);
  const { unitPrices: _, ...noPacket } = request;
  assert.equal(valid('buildSubmission', { ...envelope, request: noPacket }), false);
  const metadata = { contractVersion: 'reader-unit-spec-intake-v1', metricPackageId: request.metricPackageId, platforms: input.platforms, unitPrices: packet };
  assert.equal(valid('unitSpecIntakeRequest', metadata), true);
  const invalid = structuredClone(metadata); invalid.unitPrices.records[0]!.source.locator = '/bad~2escape';
  assert.equal(valid('unitSpecIntakeRequest', invalid), false);
  const wrongUnit = structuredClone(metadata); (wrongUnit.unitPrices.records[0]!.observation.quantity as any).unit = 'kg';
  assert.equal(valid('unitSpecIntakeRequest', wrongUnit), false);
  assert.equal(valid('unitSpecIntakeRequest', { ...metadata, workspaceId: request.metricPackageId }), false, 'server binds route identity');
  assert.equal(valid('unitSpecIntakeRequest', { ...metadata, unitPrices: { ...packet, records: [] } }), false);
});
