import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';
import { packageAReaderFixture } from '../helpers/package-a-reader-fixture.js';

const baseline = JSON.parse(await fs.readFile(new URL('../fixtures/package-a-reader-main.json', import.meta.url), 'utf8')) as {
  revision: string; variants: { policy: 'automation-metric-capture-v1' | 'automation-metric-capture-v2'; htmlSha256: string; readerJsonSha256: string }[];
};
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
for (const variant of baseline.variants) test(`${variant.policy} public HTML and reader-row JSON retain independent main bytes`, async () => {
  assert.equal(baseline.revision, '82459bb9baa0b63e645c10a1ea0227c4c30cb88c');
  const result = await packageAReaderFixture(variant.policy);
  assert.equal(hash(result.html), variant.htmlSha256);
  assert.equal(hash(result.readerJson), variant.readerJsonSha256);
});
