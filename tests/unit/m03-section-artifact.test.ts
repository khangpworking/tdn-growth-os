import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  renderM03SectionArtifact,
  verifyM03SectionArtifact,
} from '../../src/modules/analysis/m03-section-artifact.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { m03SectionArtifactChainFixture } from '../fixtures/m03-section-artifact-synthetic.js';

// Test-authoring gate: this is the single owner for deterministic HTML/receipt
// composition. A32-A35 retain ownership of arithmetic, chart, citation and prose.
test('renders and replays one evidence-bound M03 HTML artifact without collapsing missing into zero', () => {
  const chain = m03SectionArtifactChainFixture('<source & "quoted">');
  const request = {
    contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-section-artifact-html-vi-v1',
    narrativeSha256: chain.narrative.narrativeSha256,
  };
  const first = renderM03SectionArtifact(
    request, chain.metricSet, chain.chartBundle, chain.envelope, chain.narrative,
  );
  assert.deepEqual(renderM03SectionArtifact(
    request,
    structuredClone(chain.metricSet),
    structuredClone(chain.chartBundle),
    structuredClone(chain.envelope),
    structuredClone(chain.narrative),
  ), first);
  assert.deepEqual(verifyM03SectionArtifact(
    first.artifact,
    first.artifact.artifactSha256,
    chain.metricSet,
    chain.chartBundle,
    chain.envelope,
    chain.narrative,
  ), first.artifact);
  assert.equal(createHash('sha256').update(first.html).digest('hex'), first.artifact.html.sha256);
  assert.equal(Buffer.byteLength(first.html), first.artifact.html.byteSize);

  assert.match(first.html, /Chưa có số đủ điều kiện/);
  assert.match(first.html, />0 VND</);
  assert.match(first.html, /ALL, WIDE và CORE chồng lấp nhau; không được cộng/);
  assert.match(first.html, /không phải tăng trưởng/);
  assert.match(first.html, /&lt;source &amp; &quot;quoted&quot;&gt;/);
  assert.doesNotMatch(first.html, /<source & "quoted">/);
  for (const paragraph of chain.narrative.paragraphs) assert.match(first.html, new RegExp(escapeRegExp(paragraph.text)));

  const forged = structuredClone(first.artifact);
  forged.html.byteSize += 1;
  const { artifactSha256: _discarded, ...forgedContent } = forged;
  forged.artifactSha256 = createHash('sha256').update(canonicalJson(forgedContent)).digest('hex');
  assert.throws(() => verifyM03SectionArtifact(
    forged,
    forged.artifactSha256,
    chain.metricSet,
    chain.chartBundle,
    chain.envelope,
    chain.narrative,
  ), /does not replay/);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
