import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import schema from '../../contracts/analysis/meta-page-source-v1.schema.json' with { type: 'json' };
import api from '../../contracts/api/research-automation-meta-page-api.schema.json' with { type: 'json' };
import peers from '../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import l9 from '../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import { metaPagePrepare, metaPageConfirm, metaPageHistory } from '../../frontend/src/generated/report-validators.generated.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const formats = require('ajv-formats') as typeof import('ajv-formats').default;
test('strict additive API compiler and CSP-safe standalone agree on closed saved-source requests', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true }); formats(ajv);
  for (const value of [peers, l9, schema, api]) ajv.addSchema(value);
  const prepare = ajv.getSchema(`${api.$id}#/$defs/prepare`)!;
  const request = { contractVersion: 'meta-page-prepare-v1', requestKey: '11111111-1111-4111-8111-111111111111', expectedRevision: 1,
    selection: { pairId: 'a'.repeat(64), peerFrameIndex: 0, peerIdentityKey: 'shop:synthetic', keywordDraftSha256: 'b'.repeat(64),
      searchCaptureId: 'retained#1', searchPosition: 1, pageId: '123456' }, htmlBase64: 'eA==', visibleFieldsBase64: 'e30=' };
  assert.equal(prepare(request), true); assert.equal(metaPagePrepare(request), true);
  for (const changed of [{ ...request, callerPeerEligibility: true }, { ...request, selection: { ...request.selection, pairId: 'uuid-is-not-a-pair' } },
    { ...request, selection: { ...request.selection, pageId: 'https://example.invalid/' } }, { ...request, expectedRevision: 0 }]) {
    assert.equal(prepare(changed), false); assert.equal(metaPagePrepare(changed), false);
  }
  assert.equal(metaPageConfirm({ contractVersion: 'meta-page-confirm-v1', requestKey: request.requestKey, expectedRevision: 1, packageId: '11111111-1111-4111-8111-111111111111' }), true);
  assert.equal(metaPageHistory([]), true);
});
