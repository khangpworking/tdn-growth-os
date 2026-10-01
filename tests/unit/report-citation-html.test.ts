import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { preparedReportFixture, mutationSnapshot } from '../helpers/prepared-report-fixture.js';
import { renderReportKitHtml } from '../../src/modules/analysis/report-kit-html.js';
import { renderReportCitationPreview, REPORT_CITATION_PREVIEW_RENDERER } from '../../src/modules/analysis/report-citation-html.js';

// Authoring gate: owns new presentation behavior, not upstream arithmetic.
// One integration-shaped fixture verifies clickable source targets, escaping,
// no mutations and unchanged historical rendering at the actual renderer seam.
test('citation preview links existing facts to exact source records without changing v1 or persisted evidence', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const inputs = { bundle: state.bundle };
  const original = renderReportKitHtml(inputs);
  const before = mutationSnapshot(state);
  const first = renderReportCitationPreview(inputs);
  assert.deepEqual(renderReportCitationPreview(inputs), first);
  assert.equal(renderReportKitHtml(inputs), original);
  assert.deepEqual(mutationSnapshot(state), before);
  const document = new JSDOM(first.html).window.document;
  assert.equal(document.body.dataset.renderer, REPORT_CITATION_PREVIEW_RENDERER);
  assert.equal(document.querySelectorAll('script,iframe,object').length, 0);
  assert.ok(document.querySelectorAll('.citation-badge').length > 0);
  for (const badge of document.querySelectorAll<HTMLAnchorElement>('.citation-badge')) {
    const target = document.querySelector(badge.getAttribute('href')!);
    assert.ok(target, 'every numbered link has a source target');
    assert.ok(badge.getAttribute('aria-label')?.includes('bằng chứng'));
    assert.match(badge.textContent!, /^\[\d+\]$/);
    assert.ok(target.querySelector('a[href^="#section-"]'), 'each citation can return to its report section');
  }
  assert.equal(document.querySelectorAll('.citation-record').length, first.projection.citations.length);
  assert.ok(document.getElementById('citation-1')!.querySelector('h3')!.textContent!.includes('Số listing'));
  for (const entry of first.projection.citations) {
    const record = document.getElementById(`citation-${entry.number}`)!;
    assert.ok(record.textContent!.includes(entry.artifact.sha256));
    const href = record.querySelector('a[download]')!.getAttribute('href')!;
    assert.ok(state.bundle.files.has(decodeURIComponent(href)));
  }
  assert.equal(document.title, 'Synthetic <Prepared> & report · Báo cáo TDN');
  assert.equal(document.querySelector('Prepared'), null);
  assert.equal(document.querySelectorAll('[id^="section-"]').length, 30);
  assert.equal((first.html.match(/@font-face/g) ?? []).length, 21);
  assert.match(document.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!, /default-src 'none'/);
});
