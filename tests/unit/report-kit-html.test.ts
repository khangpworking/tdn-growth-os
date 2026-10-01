import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { DescriptiveMarketMethods, EvidenceRef, LiteralMarketObservation, MarketObservationScope } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import { buildReportAssemblySnapshot } from '../../src/modules/analysis/report-assembly-snapshot.js';
import { renderReportKitHtml } from '../../src/modules/analysis/report-kit-html.js';
import { renderReportAssemblyHtml } from '../../src/modules/analysis/report-assembly-html.js';
import { renderResearchReportHtml } from '../../src/modules/analysis/research-report-html.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { preparedReportFixture } from '../helpers/prepared-report-fixture.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

const documentOf = (html: string): Document => new JSDOM(html).window.document;
const textOf = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
const textOutsideAppendix = (document: Document): string => {
  document.getElementById('appendix')?.remove();
  return textOf(document.body);
};

const ref = (locator: string): EvidenceRef => ({ sourceSha256: 'a'.repeat(64), locator });
const scope: MarketObservationScope = {
  universe: 'Listing trong bảng A', geography: 'Việt Nam', frame: 'Bảng nguồn A',
  inclusionRule: 'Mọi dòng', exclusionRule: 'Không loại dòng', variantRule: 'Không gộp biến thể',
};
const period = { start: '2026-01-01', end: '2026-01-31', timezone: 'Asia/Ho_Chi_Minh', basis: 'Khai báo trong nguồn' };

function observation(
  locator: string, entityLabel: string | null, state: 'missing' | 'observed_zero' | 'observed_value' | 'UNKNOWN', value: string | null,
  precision: 'exact' | 'non_exact' = 'exact',
): LiteralMarketObservation {
  return {
    source: ref(locator), sourceWording: `Nguồn ghi ${entityLabel ?? 'không rõ'}`, entityLabel, measureLiteral: 'Doanh số tháng',
    measureDefinition: 'Như nguồn khai báo', unit: 'VND', period, scope, observation: { state, value, precision }, aggregation: null,
  };
}

function descriptiveFixture(): DescriptiveMarketMethods {
  const m05 = [
    observation('B2', '<b>Shop & Co</b>', 'observed_value', '1234.5'),
    observation('B3', 'Shop Zero', 'observed_zero', '0'),
    observation('B4', 'Shop Missing', 'missing', null),
    observation('B5', 'Shop Unknown', 'UNKNOWN', null),
  ];
  return {
    contractVersion: '1.0.0', methodId: 'source-bound-descriptive-market', methodVersion: '1.0.0', methodOutputId: 'b'.repeat(64),
    input: {
      contractVersion: '1.0.0',
      sourcePackage: { packageId: 'pkg', version: 1, manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64) },
      sources: [{ logicalPath: 'market/a.json', sha256: 'a'.repeat(64), evidenceFamily: 'synthetic', providerProvenance: 'synthetic' }],
      configuration: {
        profileId: 'source-bound-descriptive-market-v1', profileVersion: '1.0.0', policyRevision: 'test',
        profileSha256: 'e'.repeat(64), adoptionSha256: 'f'.repeat(64), runConfiguration: ref('config'),
      },
      question: 'Câu hỏi tổng hợp', scope, m05,
      m06: [{ observation: observation('C2', null, 'observed_value', '12'), objectLiteral: 'Số cơ sở đang bán', statusLiteral: 'Đang bán', dateMeaning: 'Ngày thu nhận' }],
      m07: [observation('D2', 'Đối thủ A', 'observed_value', '50')],
      peerSet: null,
      m09: [{
        source: ref('E2'), statementType: 'COUNTEREVIDENCE', sourceWording: 'Lời trong nguồn về sự kiện', attribution: 'Báo X',
        publicationDate: null, eventDate: null, dateBasis: 'Không nêu', namedScope: 'Toàn ngành', targetLink: null, affectedMetricLiteral: null, conflictRefs: [],
      }],
    },
    sections: {
      M05: {
        locatedRecordCount: 4,
        partitions: [{
          recordPointers: ['/input/m05/0', '/input/m05/1', '/input/m05/2', '/input/m05/3'], measureLiteral: 'Doanh số tháng', unit: 'VND', period, scope,
          subtotal: null, complete: false, coverage: { observedCount: 1, zeroCount: 1, missingCount: 1, unknownCount: 1, nonExactCount: 0 },
          blockers: ['ADDITIVITY_UNDECLARED', 'VALUE_MISSING', 'VALUE_UNKNOWN'],
        }],
        blockers: [],
      },
      M06: { locatedRecordCount: 1, recordPointers: ['/input/m06/0'], uniqueEntityCount: null, blockers: [] },
      M07: { mode: 'UNRANKED_INVENTORY', recordPointers: ['/input/m07/0'], comparisons: [], blockers: ['M07_PEER_SET_UNAPPROVED'] },
      M09: { locatedRecordCount: 1, events: [{ recordPointer: '/input/m09/0', blockers: ['M09_EVENT_DATE_UNKNOWN'] }], blockers: [] },
    },
    limitations: ['Hồ sơ này không phải quy mô toàn thị trường.'],
  };
}

function normalizedDescriptiveInput(): DescriptiveMarketMethods['input'] {
  return {
    ...descriptiveMarketFixture().descriptor,
    sourcePackage: {
      packageId: '00000000-0000-4000-8000-000000000001', version: 1,
      manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64),
    },
  };
}

test('renders every catalog section in order with truthful chips, no script, and stable bytes', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const inputs = { bundle: state.bundle, snapshot, retainedM03: state.retainedM03 };
  const legacyBefore = renderReportAssemblyHtml(inputs);

  const html = renderReportKitHtml(inputs);
  assert.equal(renderReportKitHtml(inputs), html);
  assert.equal(renderReportAssemblyHtml(inputs), legacyBefore);
  assert.equal(renderResearchReportHtml(state.bundle), renderResearchReportHtml(state.bundle));
  assert.doesNotMatch(html, /<script|javascript:|\son[a-z]+=|<link|@import/i);
  const urls = [...html.matchAll(/url\(([^)]*)\)/gi)].map(match => match[1]!.trim().replace(/^(['"])(.*)\1$/, '$2'));
  assert.equal(urls.length, 6, 'only the six bundled fonts may use CSS URLs');
  for (const url of urls) assert.match(url, /^data:font\/woff2;base64,[A-Za-z0-9+/]+={0,2}$/);

  const document = documentOf(html);
  const catalogIds = state.bundle.packet.catalog.sections.map(section => section.sectionId);
  assert.equal(catalogIds.length, 30);
  assert.deepEqual([...document.querySelectorAll('[id^="section-"]')].map(node => node.id), catalogIds.map(id => `section-${id}`));
  const labels: Record<string, string> = {
    PARTIAL_DETERMINISTIC_DRAFT: 'Có đầu ra một phần', METHOD_ONLY: 'Mới có phương pháp', BLOCKED: 'Thiếu đầu vào',
    MANUAL_REVIEW_REQUIRED: 'Cần người xem xét', NOT_IMPLEMENTED: 'Chưa triển khai',
  };
  for (const section of state.bundle.packet.sections) {
    const node = document.getElementById(`section-${section.sectionId}`)!;
    assert.equal(textOf(node.querySelector('.chip')), labels[section.deliveryState], section.sectionId);
  }
  const partial = state.bundle.packet.sections.filter(section => section.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT').length;
  assert.equal(textOf(document.querySelector('.cv-kpi strong')), `${partial} / 30`);
  assert.doesNotMatch(textOutsideAppendix(document), /—/);
});

test('resolves every in-page link, including legacy evidence anchors, and keeps the evidence appendix', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const document = documentOf(renderReportKitHtml({ bundle: state.bundle, snapshot, retainedM03: state.retainedM03 }));
  const ids = new Set([...document.querySelectorAll('[id]')].map(node => node.id));
  assert.equal(ids.size, document.querySelectorAll('[id]').length, 'ids are unique');
  const fragments = [...document.querySelectorAll('a[href^="#"]')].map(anchor => decodeURIComponent(anchor.getAttribute('href')!.slice(1)));
  assert.ok(fragments.length > 30);
  assert.deepEqual(fragments.filter(fragment => !ids.has(fragment)), []);
  assert.ok(document.getElementById('appendix'));
  for (const id of ['claims', 'provenance', 'readiness', 'source-rows', 'files', 'chart-spec', 'assembly']) {
    assert.ok(document.querySelector(`#appendix #${id}`), `appendix keeps ${id}`);
  }
  assert.ok(document.querySelectorAll('#appendix a[download]').length > 0);
});

test('draws only positive exact values as bars and never turns a missing or zero value into a fill', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const document = documentOf(renderReportKitHtml({ bundle: state.bundle, snapshot, retainedM03: state.retainedM03 }));
  for (const fill of document.querySelectorAll('.trk:not(.sg) i')) {
    assert.match(fill.getAttribute('style')!, /^width:\d{1,3}\.\d{2}%$/);
    assert.notEqual(fill.getAttribute('style'), 'width:0.00%');
  }
  for (const row of document.querySelectorAll('.pr')) {
    if (row.querySelector('.miss')) assert.equal(row.querySelector('.trk'), null);
  }
  for (const gap of document.querySelectorAll('.kpi.gap')) assert.doesNotMatch(textOf(gap), /\d/);
  assert.match(textOf(document.querySelector('#section-M03 .rule')), /không phải nhóm shop hàng đầu hoặc nước xuất xứ/);
  assert.match(textOf(document.querySelector('.kpis')), /Không phải số listing của toàn thị trường/);
});

test('shows a specific missing state for M05, M06, M07 and M09 without descriptive methods', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const document = documentOf(renderReportKitHtml({ bundle: state.bundle, snapshot, retainedM03: state.retainedM03 }));
  for (const id of ['M05', 'M06', 'M07', 'M09']) {
    const node = document.getElementById(`section-${id}`)!;
    assert.match(textOf(node.querySelector('.miss-box')), /Hồ sơ mô tả thị trường chưa được cung cấp/, id);
    assert.equal(node.querySelector('table'), null, id);
  }
  const m08 = document.getElementById('section-M08')!;
  assert.ok(m08.querySelectorAll('.need li').length > 0);
  assert.ok([...m08.querySelectorAll('.need li')].every(item => item.classList.contains('ok') || /Chưa có|Không hợp lệ|Cần có/.test(textOf(item))));
});

test('renders supplied descriptive rows as structured rows with exact state tags and escaped source text', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const html = renderReportKitHtml({ bundle: state.bundle, snapshot, retainedM03: state.retainedM03, descriptiveMethods: descriptiveFixture() });
  const document = documentOf(html);

  const m05 = document.getElementById('section-M05')!;
  assert.equal(m05.querySelectorAll('tbody tr').length, 4);
  assert.equal(m05.querySelectorAll('.plot .pr').length, 2, 'only exact observed rows are plotted');
  const plotted = [...m05.querySelectorAll('.plot .pr')];
  assert.equal(plotted[0]!.querySelectorAll('.trk i').length, 1);
  assert.equal(plotted[1]!.querySelectorAll('.trk i').length, 0, 'observed zero draws no fill');
  assert.match(textOf(m05.querySelector('table')), /Quan sát bằng 0/);
  assert.match(textOf(m05.querySelector('table')), /Thiếu/);
  assert.match(textOf(m05.querySelector('table')), /UNKNOWN/);
  assert.match(textOf(m05), /1\.234,5 VND/);
  assert.match(textOf(m05), /Chưa có tổng hợp/);
  assert.match(textOf(m05), /Nguồn chưa khai báo các thành viên có thể cộng dồn/);
  assert.ok(m05.innerHTML.includes('&lt;b&gt;Shop &amp; Co&lt;/b&gt;'));
  assert.equal(m05.querySelector('table b'), null);
  assert.doesNotMatch(html, /<b>Shop & Co<\/b>/);

  assert.match(textOf(document.getElementById('section-M06')), /không phải số đối tượng duy nhất/);
  assert.match(textOf(document.getElementById('section-M06')), /Số cơ sở đang bán/);
  assert.match(textOf(document.getElementById('section-M07')), /không xếp hạng/);
  assert.match(textOf(document.getElementById('section-M07')), /Đối thủ A/);
  assert.match(textOf(document.getElementById('section-M07')), /Nhóm đối thủ chưa được duyệt/);
  const m09 = textOf(document.getElementById('section-M09'));
  assert.match(m09, /Lời trong nguồn về sự kiện/);
  assert.match(m09, /Bằng chứng ngược/);
  assert.match(m09, /Ngày đăng chưa rõ/);
  assert.match(m09, /không phải kết luận về nguyên nhân/);
  assert.match(m09, /Chưa rõ ngày của sự kiện/);
  assert.match(textOf(m05), /Hồ sơ mô tả thị trường được nạp riêng/);
});

test('shows a calculated partial M05 subtotal with its missing-value coverage instead of claiming it is unavailable', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const input = normalizedDescriptiveInput();
  input.m05[1]!.observation = { state: 'missing', value: null, precision: 'exact' };
  input.m05[1]!.sourceWording = 'Search count not reported';
  const descriptiveMethods = buildDescriptiveMarketMethods(input).output;
  const document = documentOf(renderReportKitHtml({ bundle: state.bundle, descriptiveMethods }));
  const section = textOf(document.getElementById('section-M05'));
  assert.match(section, /Tổng quan sát một phần: 12 search events/);
  assert.match(section, /Thiếu 1/);
  assert.match(section, /Chưa đủ dữ liệu bắt buộc/);
  assert.doesNotMatch(section, /Chưa có tổng hợp|Đủ thành viên bắt buộc/);
});

test('M07 displays actual observation periods and scopes in owner-declared peer order', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const input = normalizedDescriptiveInput();
  const peerScope = { ...input.scope, geography: 'Synthetic peer geography', frame: 'Peer source frame 2024', variantRule: 'Pack of 30' };
  const peerPeriod = { start: '2024-02-01', end: '2024-02-29', timezone: 'UTC', basis: 'Peer source month' };
  const names = ['Anchor', 'First in source', 'First in owner order'];
  input.m07 = ['10', '12', '8'].map((value, index) => ({
    ...structuredClone(input.m05[0]!), entityLabel: names[index]!, sourceWording: `${value} reported searches`,
    source: { sourceSha256: input.m05[0]!.source.sourceSha256, locator: `/observations/${index}` },
    period: peerPeriod, scope: peerScope, observation: { state: 'observed_value', value, precision: 'exact' }, aggregation: null,
  }));
  input.m05 = [];
  input.scope = peerScope;
  input.peerSet = {
    anchorRef: input.m07[0]!.source, peerRefs: [input.m07[2]!.source, input.m07[1]!.source],
    membershipBasis: 'Owner explicitly selected source-local references', scope: peerScope, membershipRevision: 'synthetic-peers-v1',
    declaration: input.configuration.runConfiguration,
  };
  const descriptiveMethods = buildDescriptiveMarketMethods(input).output;
  const document = documentOf(renderReportKitHtml({ bundle: state.bundle, descriptiveMethods }));
  const section = document.getElementById('section-M07')!;
  const comparison = section.querySelector('[aria-label="Đối chiếu song song"]')!;
  const comparisonCells = [...comparison.querySelectorAll('tbody th, tbody td:first-of-type')];
  assert.equal(comparisonCells.length, 4);
  for (const cell of comparisonCells) {
    const text = textOf(cell);
    assert.match(text, /01\/02\/2024 đến 29\/02\/2024/);
    assert.match(text, /UTC · Peer source month/);
    assert.match(text, /Synthetic peer geography/);
    assert.match(text, /Peer source frame 2024/);
    assert.match(text, /Pack of 30/);
  }
  const inventoryRows = [...section.querySelectorAll('[aria-label="Quan sát đối thủ"] tbody tr')];
  assert.equal(inventoryRows.length, 3);
  assert.ok(textOf(inventoryRows[1]!.querySelector('th')).startsWith('First in owner order'));
  assert.ok(textOf(inventoryRows[2]!.querySelector('th')).startsWith('First in source'));
  assert.match(textOf(inventoryRows[1]!), /01\/02\/2024 đến 29\/02\/2024/);
  assert.match(textOf(section), /Thứ tự theo nhóm đối thủ do chủ dự án khai báo/);
  assert.doesNotMatch(textOf(section), /Thứ tự là thứ tự trong nguồn/);
});

test('uses copy that follows the actual count and never implies a complete or scored report', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const document = documentOf(renderReportKitHtml({ bundle: state.bundle, snapshot, retainedM03: state.retainedM03 }));
  const text = textOutsideAppendix(document);
  assert.doesNotMatch(text, /\bundefined\b|\bNaN\b|\[object/);
  assert.doesNotMatch(text, /\b[CP][0-3]\b/);
  assert.match(text, /không phải phần trăm hoàn thành hay độ tin cậy/);
  assert.match(textOf(document.querySelector('#status')), /không phải điểm hoàn thành/);
  const all = (lanes: ReadonlyArray<{ scopeKey: string; points: ReadonlyArray<{ metric: string; valueText: string }> }>) => lanes.find(lane => lane.scopeKey === 'all')!;
  const allShops = all(state.bundle.charts.totals.scopes).points.find(point => point.metric === 'shops')?.valueText;
  const m04 = textOf(document.getElementById('section-M04'));
  if (all(state.bundle.charts.topShopShare.scopes).points.length > 0 && allShops !== undefined && Number(allShops) < 10) assert.match(m04, /chỉ có \d+ shop nên/);
  assert.doesNotMatch(m04, /top3(?!\w)/);
});

test('escapes a hostile workspace title in the page title and heading', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const html = renderReportKitHtml({ bundle: state.bundle, snapshot, retainedM03: state.retainedM03 });
  const title = (JSON.parse(state.bundle.files.get('workspace.json')!.toString('utf8')) as { title: string }).title;
  assert.match(title, /[<>&]/);
  const document = documentOf(html);
  assert.equal(textOf(document.querySelector('h1')), title);
  assert.ok(document.title.startsWith(title));
  assert.equal(html.includes(`<h1>${title}</h1>`), false);
});

test('renders the source-backed partial path without a snapshot and rejects half-supplied assembly inputs', async t => {
  const state = await preparedReportFixture();
  t.after(state.cleanup);
  const { snapshot } = buildReportAssemblySnapshot(state);
  const html = renderReportKitHtml({ bundle: state.bundle });
  const document = documentOf(html);
  assert.equal(document.querySelectorAll('[id^="section-"]').length, 30);
  assert.equal(document.getElementById('assembly'), null);
  assert.ok(document.querySelector('#appendix #claims'));
  assert.equal(renderReportKitHtml({ bundle: state.bundle }), html);

  assert.throws(() => renderReportKitHtml({ bundle: state.bundle, snapshot }), /SNAPSHOT_AND_RETAINED_M03_MUST_BE_TOGETHER/);
  assert.throws(() => renderReportKitHtml({ bundle: state.bundle, retainedM03: state.retainedM03 }), /SNAPSHOT_AND_RETAINED_M03_MUST_BE_TOGETHER/);
  const mismatched = { ...snapshot, sections: snapshot.sections.map((section, index) => index === 0
    ? { ...section, materialization: { ...section.materialization, deliveryState: 'NOT_IMPLEMENTED' as const } } : section) };
  assert.throws(() => renderReportKitHtml({ bundle: state.bundle, snapshot: mismatched, retainedM03: state.retainedM03 }), /SNAPSHOT_DELIVERY_STATE_MISMATCH:M01/);
});
