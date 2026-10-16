import type { ReportCitations } from '../research-automation/descriptive-report.js';
import { META_AD_NAME_WITHHELD, META_AD_NOTE, META_AD_SELLER_VOICE, META_AD_TEXT_WITHHELD, metaAdCitation, metaAdDate, type MetaAdPage } from '../research-automation/meta-ad-report.js';
import { esc } from './format.js';

/** The sections that already show what sellers say or where they appear. Ad copy is placed nowhere else. */
export const INSIGHT_META_AD_SECTIONS = ['I02', 'I12', 'I13'] as const;
export type InsightMetaAdSectionId = typeof INSIGHT_META_AD_SECTIONS[number];
export const INSIGHT_META_AD_EXPLANATION = `Quảng cáo trên Meta là ${META_AD_SELLER_VOICE}, giữ riêng với lời khách hàng.`;

const table = (label: string, caption: string, head: readonly string[], rows: readonly (readonly string[])[]): string =>
  `<div class="table-wrap" role="region" aria-label="${label}" tabindex="0"><table><caption>${caption}</caption><thead><tr>${head.map(cell => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

/**
 * Confirmed Meta ad-library pages as seller voice. Read-only presentation of text the Market report also quotes: nothing here is coded,
 * counted, ranked or turned into a persona, and no figure is added across pages. Returns '' when no page is confirmed.
 */
export function insightMetaAdSection(pages: readonly MetaAdPage[], id: InsightMetaAdSectionId, citations: ReportCitations): string {
  if (pages.length === 0) return '';
  const marks = (page: MetaAdPage): string => page.captures.map(capture => citations.mark(metaAdCitation(capture))).join(' ');
  const name = (page: MetaAdPage): string => page.pageName === null ? esc(META_AD_NAME_WITHHELD) : `<span data-quote>${esc(page.pageName)}</span>`;
  const voice = `<p>Quảng cáo trên Meta là ${META_AD_SELLER_VOICE}: chữ người bán tự viết về sản phẩm của mình. Không phải ý kiến khách hàng; không dùng để mã hóa, đếm tần suất hay dựng chân dung.</p>`;
  if (id === 'I02') {
    const rows = pages.map(page => [name(page), (page.excerpt === null ? esc(META_AD_TEXT_WITHHELD) : `<span data-quote>${esc(page.excerpt)}</span>${page.excerptCut ? '…' : ''}`) + ' ' + marks(page)]);
    return `<div class="meta-ads" id="insight-meta-ads-i02"><h3>Quảng cáo trên Meta của các trang đã xác nhận</h3>${voice}<p>Đoạn trích giữ nguyên văn phần đầu nội dung quảng cáo.</p>${table('Quảng cáo trên Meta: lời người bán', 'Lời người bán (quảng cáo), tách khỏi lời khách hàng', ['Trang', 'Lời người bán (quảng cáo)'], rows)}</div>`;
  }
  if (id === 'I12') {
    const rows = pages.map(page => [name(page) + ' ' + marks(page), esc(String(page.adCount)), esc(metaAdDate(page.earliestStart)), esc(String(page.daysRun))]);
    return `<div class="meta-ads" id="insight-meta-ads-i12"><h3>Quảng cáo trên Meta: điểm tiếp xúc có xuất hiện</h3>${voice}<p>Mục này chỉ ghi điểm tiếp xúc có xuất hiện; chưa đo lượt xem hay kết quả.</p>${table('Quảng cáo trên Meta: điểm tiếp xúc', 'Trang có quảng cáo trên Meta, mỗi trang tính riêng', ['Trang', 'Số quảng cáo đã xác nhận', 'Ngày bắt đầu đầu tiên', 'Số ngày đã chạy (tính tới ngày thu)'], rows)}<p>${esc(META_AD_NOTE)}</p></div>`;
  }
  const rows = pages.map(page => [name(page) + ' ' + marks(page), esc(String(page.adCount))]);
  return `<div class="meta-ads" id="insight-meta-ads-i13"><h3>Quảng cáo trên Meta: tên trang theo người bán</h3>${voice}<p>Tên trang do người bán tự đặt và giữ nguyên chữ; tên trang không xác nhận thương hiệu hay đối thủ.</p>${table('Quảng cáo trên Meta: tên trang', 'Tên trang theo người bán, mỗi trang tính riêng', ['Trang', 'Số quảng cáo đã xác nhận'], rows)}</div>`;
}
