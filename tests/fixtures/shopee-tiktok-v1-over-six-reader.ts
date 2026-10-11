import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

export const OVER_SIX_CODES = ['Z_LAST', 'A_FIRST', 'MIDDLE', 'BETA', 'OMEGA', 'ALPHA', 'DELTA', 'GAMMA'] as const;

const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

/**
 * Frozen, synthetic >6-code v1 input shared by the origin/main golden generator and replay
 * assertions. The source bytes come from the existing origin-render fixtures; only the draft and
 * cited report are replaced with the eight-code candidate response used by the integration tests.
 */
export function overSixReaderInput(platform: 'shopee' | 'tiktok') {
  const frozen = JSON.parse(fs.readFileSync(`tests/fixtures/${platform}-v1-reader-origin-input.json`, 'utf8')) as {
    identity: Record<string, unknown>;
    draft: Record<string, any>;
    report: Record<string, any>;
    source: { records: Array<Record<string, any>> };
    acquiredAt: string | null;
    scope: Record<string, unknown>;
  };
  const proposalId = '99999999-9999-4999-8999-999999999999';
  const requestKey = '88888888-8888-4888-8888-888888888888';
  const eligibleIndexes = frozen.source.records.flatMap((record, index) => {
    const eligible = platform === 'shopee'
      ? record.admission === 'SELECTED_TEXT' && record.textState === 'READABLE' && record.text !== null
      : record.disposition === 'INCLUDED' && record.voice === 'CUSTOMER' && record.text !== null;
    return eligible ? [index] : [];
  });
  const codes = OVER_SIX_CODES.map((code, i) => {
    const recordIndex = eligibleIndexes[i % eligibleIndexes.length]!;
    const record = frozen.source.records[recordIndex]!;
    const text = String(record.text).slice(0, 10);
    return { code, label: code, recordIndex, citationId: i + 1,
      quote: { text, start: 0, end: text.length } };
  });
  const draft = { ...frozen.draft, proposalId, requestKey, codes,
    counts: { recordsCoded: new Set(codes.map(code => code.recordIndex)).size, codesProposed: codes.length, quotesCited: codes.length } };
  const sorted = [...codes].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0).slice(0, 6);
  const findings = sorted.map(entry => {
    const record = frozen.source.records[entry.recordIndex]!;
    return { sectionId: 'I10', code: entry.code, label: entry.label,
      template: `Mã chủ đề trong mẫu lời nguồn: {{${platform}.codes.${entry.code}.records}} bản ghi có trích dẫn trực tiếp (đề xuất, chờ chủ duyệt).`,
      status: 'PROPOSED_AWAITING_REVIEW', scope: frozen.report.findings[0]!.scope,
      citations: [{ citationId: entry.citationId,
        locator: platform === 'shopee' ? record.locator.textPointer : `bình luận ${record.commentId}`,
        url: platform === 'shopee' ? null : record.videoUrl }] };
  });
  const report = { ...frozen.report, proposalId, draftSha256: digest(draft), findings,
    counts: { recordsCoded: new Set(codes.map(code => code.recordIndex)).size, codesProposed: codes.length, quotesCited: codes.length } };
  return { ...frozen, identity: { ...frozen.identity, draftPairId: digest(draft), semanticSha256: digest(report), sourceReportSha256: digest(report) }, draft, report };
}
