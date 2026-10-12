import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutomationQualitativeDraft } from '../../contracts/analysis/automation-qualitative-draft-v1.generated.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { qualitativeDraftSection } from '../../src/modules/analysis/reader-report/qualitative-draft-report.js';

const digest = (letter: string): string => letter.repeat(64);
const uuid = (letter: string): string => `${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`;

function fixture(): AutomationQualitativeDraft {
  const locator = (rowIndex: number) => ({ owner: 'https://example.test/retained', pageSha256: digest('b'), pageIndex: 0, rowIndex, textPointer: `/records/${rowIndex}/text` });
  const text = 'Dùng sau khi đi làm — ổn.';
  const quote = { recordIndex: 0, recordId: 'record-0', locator: locator(0), text: 'Dùng sau khi đi làm', start: 0, end: 19 };
  return {
    contractVersion: 'automation-qualitative-draft-v1', draftId: uuid('a'), requestKey: uuid('b'),
    binding: { workspaceId: uuid('c'), runId: uuid('d'), scopeSha256: digest('e'), sourceSetSha256: digest('f'), requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } },
    source: { platform: 'SHOPEE', sourceType: 'S05_LOCATED_REVIEW', sourceSha256: digest('1'), sourcePackageId: uuid('e'), sourceManifestSha256: digest('2'), sourceContentSha256: digest('3') },
    records: [{ recordIndex: 0, recordId: 'record-0', text, locator: locator(0), sourceHash: digest('4'), author: { state: 'UNAVAILABLE', hash: null }, admission: 'INCLUDED', admissionReason: null }],
    classifications: [{ recordIndex: 0, recordId: 'record-0', status: 'CLASSIFIED', confidence: 'MEDIUM', situation: 'Sau giờ làm', journey: 'SAU_MUA', topic: 'Mùi vị', statedSentiment: 'POSITIVE', quotes: [quote], uncertainty: null }],
    cards: [], counts: { included: 1, excluded: 0, unclear: 0, classified: 1, unclassified: 0 },
    policy: { status: 'PROPOSED_AWAITING_REVIEW', reliability: { state: 'UNAVAILABLE', code: 'U11_STATISTIC_UNAVAILABLE' }, releaseEligibility: 'UNAVAILABLE', mainConclusionUse: 'EXCLUDED' },
    limitations: ['U11_STATISTIC_UNAVAILABLE; counts are scoped record accounting only.'],
  } as AutomationQualitativeDraft;
}

function citations() {
  const registry = new CitationRegistry();
  return { registry, mark: (value: Parameters<CitationRegistry['cite']>[0]): string => {
    const number = registry.cite(value);
    return number === null ? 'Chưa có nguồn' : `<sup class="cite">[${number}]</sup>`;
  } };
}

test('qualitative report projection preserves source quote, locator, policy and source-bound labels', () => {
  const draft = fixture();
  const c = citations();
  const html = qualitativeDraftSection(draft, 'I02', c);
  assert.match(html, /Dùng sau khi đi làm — ổn\./);
  assert.match(html, /Dùng sau khi đi làm/);
  assert.match(html, /UTF-16 0–19/);
  assert.match(html, /\/records\/0\/text/);
  assert.match(html, /U11_STATISTIC_UNAVAILABLE/);
  assert.match(html, /không có tỷ lệ, kappa hoặc số liệu suy rộng/);
  assert.match(html, /Thấy gì/);
  assert.match(html, /Dùng để/);
  assert.match(html, /Đừng hiểu là/);
  assert.match(html, /Không dùng để suy ra người dùng, quan hệ nhân quả, độ tin cậy/);
  assert.match(html, /số người, tỷ lệ thị trường/);
  assert.equal(c.registry.entries().length, 1, 'same retained record has one stable citation');
});

test('qualitative appendix keeps exact source hashes and unavailable author state without inventing a result', () => {
  const draft = fixture();
  const c = citations();
  const html = qualitativeDraftSection(draft, 'I17', c);
  assert.match(html, new RegExp(`sourceSha256=${draft.source.sourceSha256}`));
  assert.match(html, new RegExp(`sourceHash=${draft.records[0]!.sourceHash}`));
  assert.match(html, /Tác giả không có dấu kiểm đủ điều kiện/);
  assert.match(html, /UNAVAILABLE/);
  assert.match(html, /EXCLUDED/);
  assert.match(html, /không gộp với nền tảng khác/);
});
