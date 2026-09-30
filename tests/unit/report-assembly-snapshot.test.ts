import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildReportAssemblySnapshot } from '../../src/modules/analysis/report-assembly-snapshot.js';
import { renderReportAssemblyHtml } from '../../src/modules/analysis/report-assembly-html.js';
import { buildSourceBackedReport } from '../../src/modules/analysis/source-backed-report.js';
import { preparedReportFixture, byteDigest } from '../helpers/prepared-report-fixture.js';

// Pure composition owns the catalog/readiness/delivery distinction. A10 tests
// own persistence; the existing arithmetic and M03 tests own calculations.
test('assembles all ordered sections with bounded delivery and exact artifacts, keeping quote absence explicit', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const first = buildReportAssemblySnapshot(state);
  const { snapshot } = first;
  const catalog = JSON.parse(state.catalogBytes.toString('utf8')) as { sections: Array<{ sectionId: string }> };
  assert.equal(snapshot.sections.length, 30);
  assert.deepEqual(snapshot.sections.map(section => section.sectionId), catalog.sections.map(section => section.sectionId));
  assert.deepEqual(snapshot.lifecycle, {
    status: 'DRAFT_PARTIAL', interpretation: 'NONE', reviewState: 'UNREVIEWED',
    finalityStatement: 'NOT_FINAL_NOT_PUBLISHABLE_NOT_COMMERCIAL_READY',
  });
  assert.deepEqual(snapshot.sections.filter(section => section.materialization.materialized).map(section => section.sectionId), [
    'M02', 'M03', 'M04', 'M13', 'I03', 'I17',
  ]);
  const noQuote = snapshot.sections.find(section => section.sectionId === 'M08')!;
  assert.equal(noQuote.materialization.deliveryState, 'BLOCKED');
  assert.equal(noQuote.materialization.methodArtifact, null);
  assert.ok(noQuote.materialization.blockers.length);
  const mainConclusion = snapshot.sections.find(section => section.sectionId === 'M01')!;
  assert.equal(mainConclusion.materialization.materialized, false);
  assert.equal(mainConclusion.readiness.state, 'BLOCKED');
  const method = snapshot.sections.find(section => section.sectionId === 'I03')!;
  assert.equal(method.readiness.state, 'BLOCKED');
  assert.equal(method.materialization.materialized, true);
  assert.equal(method.readinessBlockedWhileMaterialized, true);

  assert.deepEqual(buildReportAssemblySnapshot({
    bundle: state.bundle, preparation: structuredClone(state.preparation), readiness: structuredClone(state.readiness),
    retainedM03: { ...structuredClone(state.retainedM03), retainedAt: '2040-01-01T00:00:00.000Z' },
  }).bytes, first.bytes);
  assert.equal('semanticVersionId' in snapshot, false);
  assert.equal('reportId' in snapshot, false);
  assert.equal('version' in snapshot, false);

  const quotedBundle = await buildSourceBackedReport({
    ...state.sourceRequest, tabletQuoteSourcePath: 'quote/source.json', tabletQuoteInputPath: 'quote/input.json',
  }, state.catalogBytes, state.dependencies);
  const quoted = buildReportAssemblySnapshot({ ...state, bundle: quotedBundle });
  assert.deepEqual(quoted.snapshot.sections.filter(section => section.materialization.materialized).map(section => section.sectionId), [
    'M02', 'M03', 'M04', 'M08', 'M13', 'I03', 'I17',
  ]);
  const quote = quoted.snapshot.sections.find(section => section.sectionId === 'M08')!;
  assert.equal(quote.readiness.state, 'BLOCKED');
  assert.equal(quote.materialization.deliveryState, 'PARTIAL_DETERMINISTIC_DRAFT');
  assert.equal(quote.readinessBlockedWhileMaterialized, true);
  assert.equal(quote.materialization.methodArtifact?.fileName, 'm08-tablet-quote-method.json');
  assert.notEqual(quoted.snapshot.assemblySha256, snapshot.assemblySha256);
  for (const section of quoted.snapshot.sections) {
    const reference = section.materialization.methodArtifact;
    if (reference === null) continue;
    const bytes = quotedBundle.files.get(reference.fileName);
    assert.ok(bytes, reference.fileName);
    assert.equal(reference.sha256, byteDigest(bytes), section.sectionId);
    const artifact = JSON.parse(bytes.toString('utf8')) as { methodOutputId: string };
    assert.equal(reference.methodOutputId, artifact.methodOutputId, section.sectionId);
  }
  for (const [role, member] of Object.entries(quoted.snapshot.m03.members)) {
    const retained = state.retainedM03.record.members[role as keyof typeof state.retainedM03.record.members];
    assert.equal(member.artifactSha256, retained.artifactSha256, role);
    const bytes = fs.readFileSync(state.artifacts.pathForDigest(member.artifactSha256));
    assert.equal(byteDigest(bytes), member.artifactSha256, role);
    assert.equal(bytes.length, member.byteSize, role);
  }

  const all = snapshot.m03.scopeTotals.find(scope => scope.key === 'all')!;
  const core = snapshot.m03.scopeTotals.find(scope => scope.key === 'core')!;
  assert.equal(all.units.missingCount, 1);
  assert.equal(all.units.complete, false);
  assert.equal(core.units.value, '0');
  assert.equal(core.units.missingCount, 0);
  assert.equal(core.units.complete, true);
  const html = renderReportAssemblyHtml({ bundle: quotedBundle, snapshot: quoted.snapshot, retainedM03: state.retainedM03 });
  assert.equal(renderReportAssemblyHtml({ bundle: quotedBundle, snapshot: quoted.snapshot, retainedM03: state.retainedM03 }), html);
  const document = new JSDOM(html).window.document;
  assert.deepEqual([...document.querySelectorAll('#assembly tr[id]')].map(row => row.id),
    catalog.sections.map(section => `assembly-${section.sectionId}`));
  assert.equal(document.querySelector('h1')?.textContent, 'Synthetic <Prepared> & report · Báo cáo bằng chứng');
  assert.equal(document.querySelector('prepared'), null);
  assert.equal(document.querySelectorAll('script').length, 0);
  const observationRows = [...document.querySelectorAll('#source-rows tbody tr')];
  assert.match(observationRows[0]!.children[3]!.textContent!, /Thiếu/i);
  assert.match(observationRows[1]!.children[3]!.textContent!, /^0(?:\s|$)/);
  for (const anchor of document.querySelectorAll('a[href^="#"]')) {
    const href = anchor.getAttribute('href')!;
    assert.ok(document.getElementById(decodeURIComponent(href.slice(1))), href);
  }
});
