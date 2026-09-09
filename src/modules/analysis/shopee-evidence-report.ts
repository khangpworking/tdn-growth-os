import type { ShopeeReviewResult } from '../../../contracts/analysis/shopee-review-result.generated.js';
import type { VerifiedShopeeReviewResult } from './shopee-review-result-reader.js';

const REPORT_VERSION = 'shopee-evidence-report-vi@1';
type Review = ShopeeReviewResult['reviews'][number];

export function renderVietnameseShopeeEvidenceReport(verified: VerifiedShopeeReviewResult): string {
  const { result, resultSha256, collection, ratings } = verified;
  const { request, packet } = collection;
  const retained = result.reviews.filter(review => review.decision === 'kept');
  const selectedByProduct = new Map(packet.selected.map(listing => [listing.productKey, listing]));
  const lines: string[] = [
    '# Báo cáo bằng chứng review Shopee',
    '',
    `- Phiên bản báo cáo: ${code(REPORT_VERSION)}`,
    `- Chủ đề: ${code(request.topic)}`,
    `- Kỳ nghiên cứu: ${code(request.period.start)} đến ${code(request.period.end)}`,
    `- Nguồn danh sách: ${code(request.source.label)}`,
    `- Thời điểm lấy nguồn danh sách: ${code(request.source.acquiredAt)}`,
    `- Thời điểm lưu collection: ${code(packet.createdAt)}`,
    `- Thời điểm collector lấy dữ liệu: ${code(packet.actor.retrievedAt)}`,
    `- Chế độ collection: ${code(result.summary.mode)}`,
    `- Result digest được chọn chính xác: ${code(resultSha256)}`,
    `- Collection digest: ${code(result.collectionSha256)}`,
    `- Filter: ${code(result.filterVersion)}; SHA-256 ${code(result.filterSha256)}`,
    `- Thời điểm tạo Result: ${code(result.createdAt)}`,
    '',
    '## Phạm vi được yêu cầu và thực tế',
    '',
    `- Số sản phẩm yêu cầu: **${result.summary.requestedProducts}**.`,
    `- Số sản phẩm/listing được chọn thực tế: **${result.summary.selectedProducts}**.`,
    `- Giới hạn yêu cầu: tối đa **${result.summary.maxCommentsPerProduct}** review cho mỗi listing được chọn.`,
    `- Dòng fetched: **${result.summary.fetchedRows}** — tổng số dòng trong các raw page đã lưu.`,
    `- Dòng normalized: **${result.summary.collected}** — dòng hợp lệ, duy nhất theo review identity và thuộc listing được chọn, được chuyển tới filter.`,
    `- GIỮ: **${result.summary.kept}**; LOẠI: **${result.summary.removed}** — hai quyết định của filter trên các dòng normalized.`,
    `- Không hợp lệ: **${result.summary.invalidRows}** — dòng provider bị loại vì schema, listing/region, xung đột identity hoặc giới hạn hiện có.`,
    `- Trùng lặp: **${result.summary.duplicateRows}** — lần xuất hiện lặp lại của cùng review identity trong dữ liệu fetched.`,
    `- Tổng dòng do provider báo: ${result.summary.providerReportedRows === null ? '**không có metadata đã xác minh**' : `**${result.summary.providerReportedRows}**`}.`,
    '',
    '### Listing đã chọn',
    '',
  ];

  if (packet.selected.length === 0) lines.push('_Không có listing đủ điều kiện được chọn._', '');
  for (const selected of packet.selected) {
    const coverage = result.summary.listings.find(item => item.listingKey === listingKey(selected));
    if (!coverage) throw new Error('Verified summary is missing selected listing coverage');
    lines.push(
      `- Sản phẩm ${code(selected.productName)}; product key ${code(selected.productKey)}; listing ${code(coverage.listingKey)}; ` +
      `URL ${code(selected.productUrl)}; cơ sở nhóm ${code(selected.groupingBasis)}; ` +
      `doanh số đúng kỳ ${code(selected.periodRevenueVnd)} VND; normalized **${coverage.collected}**; ` +
      `GIỮ **${coverage.kept}**; LOẠI **${coverage.collected - coverage.kept}**; trạng thái ${code(coverage.status)}.`,
    );
  }

  lines.push('', '## Cảnh báo dữ liệu hiện có', '');
  if (result.summary.warnings.length === 0) lines.push('_Không có cảnh báo được lưu trong Result._');
  else for (const warning of result.summary.warnings) lines.push(`- ${code(warning)}`);

  lines.push('', '## Review được giữ', '');
  if (retained.length === 0) lines.push('_Không có review nào được filter giữ lại._', '');
  for (const selected of packet.selected) {
    const reviews = retained.filter(review => review.productKey === selected.productKey &&
      review.listingKey === listingKey(selected));
    if (reviews.length === 0) continue;
    lines.push(`### Sản phẩm: ${code(selected.productName)}`, '', `- Listing: ${code(listingKey(selected))}`, '');
    for (const [index, review] of reviews.entries()) {
      const rating = ratings.get(review.listingKey + ':' + review.reviewId);
      if (rating === undefined) throw new Error('Verified review rating lineage is missing');
      lines.push(
        `#### Review ${index + 1}`,
        '',
        '- Nguyên văn được trích dẫn an toàn:',
        '',
        quotedInertText(review.text),
        '',
        `- Rating: **${rating}/5**.`,
        `- Matched signals: ${review.signals.length ? review.signals.map(code).join(', ') : '_không có_'}.`,
        `- Cờ guided field mơ hồ: **${review.guidedFieldBoundary === 'ambiguous-preserved' ? 'Có' : 'Không'}** ` +
          `(${code(review.guidedFieldBoundary)}).`,
        `- Filter score: **${review.score}**.`,
        `- Tham chiếu Result digest: ${code(resultSha256)}.`,
        `- Tham chiếu raw artifact digest: ${code(review.rawPageSha256)}; row index: **${review.rawRowIndex}**.`,
        '',
      );
    }
  }

  const orphaned = retained.filter(review => !selectedByProduct.has(review.productKey));
  if (orphaned.length) throw new Error('Verified retained review has no selected product metadata');

  lines.push(
    '## Cách đọc và giới hạn',
    '',
    '- Filter score chỉ là điểm ưu tiên heuristic theo quy tắc hiện có; không phải sentiment, confidence, trust score hoặc xác suất đúng.',
    '- Attribution dạng lời truyền miệng được giữ nguyên trong nguyên văn. Hearsay không phải bằng chứng trải nghiệm trực tiếp.',
    '- Hiệu ứng được báo cáo là lời trong review; việc giữ review không xác minh tuyên bố sức khỏe và không thiết lập quan hệ nhân quả.',
    '- Một listing bestseller được chọn không đại diện cho toàn bộ sản phẩm, mọi shop hoặc toàn thị trường.',
    '- Báo cáo không gán theme, kết luận thị trường hoặc mức E0–E5. Metadata không có trong artifact đã xác minh không được bổ sung.',
    '- Không có author identifier trong báo cáo. Điều này không phải cam kết rằng chính nội dung free text không chứa thông tin cá nhân.',
    '',
  );
  return lines.join('\n');
}

function listingKey(value: { platform: string; shopId: string; itemId: string }): string {
  return `${value.platform}:${value.shopId}:${value.itemId}`;
}

function code(value: string): string {
  const escaped = escapeHtmlAndLines(value);
  const longest = Math.max(0, ...([...escaped.matchAll(/`+/g)].map(match => match[0].length)));
  const fence = '`'.repeat(longest + 1);
  const padding = escaped.startsWith('`') || escaped.endsWith('`') || escaped.startsWith(' ') || escaped.endsWith(' ') ? ' ' : '';
  return `${fence}${padding}${escaped}${padding}${fence}`;
}

function quotedInertText(value: string): string {
  const escaped = escapeHtmlAndLines(value);
  return `> <pre><code>${escaped}</code></pre>`;
}

function escapeHtmlAndLines(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('\r', '&#13;').replaceAll('\n', '&#10;');
}
