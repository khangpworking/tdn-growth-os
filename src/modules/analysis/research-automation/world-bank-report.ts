import type { WorldBankIntakeV1 } from '../../../../contracts/analysis/world-bank-intake-v1.generated.js';
import type { PackageRef } from '../../../../contracts/api/research-automation-macro-intake-api.generated.js';
import { CitationRegistry } from '../citation-registry.js';
import { renderCitationRegister, renderCitationMarkOrMissing } from '../citation-register-html.js';
import { escapeHtml as escape } from './descriptive-report.js';

export const WORLD_BANK_DISPLAY_VERSION = 'world-bank-source-display-v1';

/** A cited source display, not an analytical section or a sample calculation.
 * The caller authenticates the retained package before entering this pure renderer. */
export function renderWorldBankSourceDisplay(descriptor: WorldBankIntakeV1, source: PackageRef): string {
  const citations = new CitationRegistry();
  const rows = descriptor.projection.rows.map(row => {
    const citation = citations.cite({ sourceKind: 'CAPTURE', identity: descriptor.projection.sourceSha256,
      locator: { kind: 'json-pointer', pointer: row.locator },
      label: `Ngân hàng Thế giới (World Bank Open Data), ${row.indicatorName} (${row.indicatorCode}), ${row.year}, cập nhật ${row.lastUpdated}`,
      retrievedAt: null, url: descriptor.projection.sourceUrl, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { packageId: source.packageId, manifestSha256: source.manifestArtifactSha256,
        contentSha256: source.packageContentSha256, logicalPath: descriptor.observationPath,
        metadataSha256: descriptor.projection.metadataSha256 } });
    return `<tr><td>${escape(row.indicatorName)}</td><td>${escape(row.countryName)}</td><td>${escape(row.year)}</td>` +
      `<td>${escape(row.value ?? 'chưa có số liệu')}</td><td>${escape(row.unit ?? 'chưa có đơn vị trong nguồn')}</td>` +
      `<td>${escape(row.statusLiteral || 'nguồn chưa ghi trạng thái')}</td><td>${escape(row.footnote ?? 'nguồn chưa có ghi chú')}</td>` +
      `<td>${escape(row.lastUpdated)}${renderCitationMarkOrMissing(citation)}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Bối cảnh vĩ mô đã lưu</title></head>` +
    `<body data-display-version="${WORLD_BANK_DISPLAY_VERSION}"><h1>Bối cảnh vĩ mô đã lưu</h1>` +
    '<p>Chuỗi số liệu nhiều năm của Việt Nam, cùng chỉ số và cách tính trong nguồn. Phạm vi toàn quốc rộng hơn ngành hàng và mẫu nghiên cứu.</p>' +
    '<p>Số liệu chỉ đặt cạnh mẫu nghiên cứu; không cộng, trừ, chia hay quy đổi tiền. Không suy ra thị phần, chân dung khách hàng hoặc quan hệ nhân quả.</p>' +
    '<p>Đây là tệp nguồn do người vận hành cung cấp và xác nhận; việc lưu giữ không xác minh độc lập nội dung nguồn. Hai nguồn cùng số liệu không được coi là hai xác nhận độc lập.</p>' +
    `<p>Định nghĩa theo nguồn: ${escape(descriptor.projection.sourceNote || 'chưa có định nghĩa trong nguồn')}</p>` +
    `<table><thead><tr><th>Chỉ số</th><th>Phạm vi</th><th>Năm</th><th>Giá trị</th><th>Đơn vị</th><th>Trạng thái nguồn</th><th>Ghi chú nguồn</th><th>Cập nhật</th></tr></thead><tbody>${rows}</tbody></table>` +
    renderCitationRegister(citations.entries(), { format: 'web' }) + '</body></html>\n';
}
