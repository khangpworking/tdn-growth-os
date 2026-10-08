import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import type { DefaultMarketPeers } from '../../../../contracts/analysis/default-market-peers.generated.js';
import { deriveDefaultMarketPeers } from '../default-market-peers.js';
import { sourceMemberLabel } from '../research-automation/descriptive-report.js';
import type { NullableRow } from './classify.js';
import type { Bundle } from './bundle.js';
import { esc } from './format.js';
import { n, plat } from './layout.js';

/** Uses classified frozen workbook rows. Screen leader tables and quick-search cards never supply memberships. */
export function readerDefaultPeers(input: ReaderReportInput, rows: NullableRow[]): DefaultMarketPeers | null {
  if (input.contractVersion !== '1.3.0') return null;
  const period = input.source!.measurementPeriod;
  const sampleKey = input.rowLineage?.sha256 ?? 'SOURCE_MISSING';
  const sourceRows = new Map(input.rows.map(row => [row.i, row]));
  const frames: DefaultMarketPeers['input']['frames'] = input.platforms.flatMap(platform => input.profile.core.map(group => ({
    platform, group, sampleKey, period, unit: 'VND' as const,
    membershipBasis: `frozen-reader-profile:${input.profile.slug}:${group}` })));
  const records: DefaultMarketPeers['input']['records'] = rows.map(row => ({
      platform: row.platform, sampleKey, group: row.seg ?? null, membership: row.seg === undefined ? 'UNKNOWN' as const : input.profile.core.includes(row.seg) ? 'IN_GROUP' as const : 'OTHER_GROUP' as const,
      period, unit: 'VND' as const, listingId: row.listing, title: row.title, brandLabel: sourceRows.get(row.i)!.brand,
      // Historical workbook conversion uses listing as the shop placeholder when its source link is absent.
      shopId: row.shop === row.listing ? null : row.shop, shopLabel: row.shopName || row.shop,
      revenue: row.rev === null ? null : String(row.rev),
      source: input.rowLineage === undefined ? null : { sourceSha256: input.rowLineage.sha256, locator: `Sheet1!A${row.i + 2}:T${row.i + 2}` },
    }));
  return deriveDefaultMarketPeers({ rule: input.peerRule, frames, records, ownerAdditions: input.ownerPeerProductIds ?? [] });
}

const STATE_TEXT: Readonly<Record<DefaultMarketPeers['frames'][number]['state'], string>> = {
  SELECTED: 'Tập mặc định đã tính từ doanh thu trong mẫu', NO_SALES: 'Chưa có doanh số tương thích',
  ZERO_REVENUE: 'Doanh thu nhóm bằng không; chưa chọn đối thủ',
  INCOMPLETE: 'Chưa đủ nguồn, doanh thu, nhóm hoặc danh tính; chưa chọn đối thủ',
};

/** Shared M07 projection for complete and nullable readers; every displayed amount goes through the existing bundle. */
export function readerPeerExhibit(
  snapshot: DefaultMarketPeers | null, bundle: Bundle,
  options: { text: (s: string) => string; metric: (id: string) => string; sourceMark: (source: { sourceSha256: string; locator: string }) => string },
): string {
  if (snapshot === null) return '';
  const { text, metric, sourceMark } = options;
  const body = snapshot.frames.map((result, index) => {
    const id = `peers.${index}`;
    bundle.set(`${id}.threshold`, snapshot.input.rule.thresholdPercent, 'num');
    if (result.totalRevenue === null) bundle.setMissing(`${id}.total`, 'dong');
    else bundle.set(`${id}.total`, Number(result.totalRevenue), 'dong');
    if (result.selectedRevenue === null) bundle.setMissing(`${id}.selected`, 'dong');
    else bundle.set(`${id}.selected`, Number(result.selectedRevenue), 'dong');
    const group = text(result.frame.group), platform = plat(result.frame.platform);
    const rows = result.selected.map((member, j) => {
      bundle.set(`${id}.${j}.rev`, Number(member.revenue), 'dong');
      const marks = member.sources.map(sourceMark).join('');
      return `<tr><td>${text(member.identity.label)}</td><td>${member.identity.kind === 'TITLE_LABEL' ? 'Nhãn thương hiệu theo tiêu đề người bán' : 'Gian hàng nguồn; chưa rõ thương hiệu'}</td><td>${n(metric(`${id}.${j}.rev`))}${marks}</td></tr>`;
    }).join('');
    const sources = result.eligible.map(sourceMark).join('');
    const table = rows ? `<table><caption>Đối thủ mặc định trong nhóm, đặt cạnh nhau</caption><thead><tr><th>Nhãn nguồn</th><th>Căn cứ danh tính</th><th>Doanh thu ước tính</th></tr></thead><tbody>${rows}</tbody></table>` : '';
    const period = `${text(result.frame.period.start)} đến ${text(result.frame.period.end)}`;
    return `<div class="peer-frame"><h3>${platform} · ${group}</h3><p>${STATE_TEXT[result.state]}. Kỳ ${period}.</p><p>Quy tắc đã chốt trước khi tính: chọn theo doanh thu giảm dần tới khi đạt ít nhất ${n(metric(`${id}.threshold`))}% doanh thu nhóm trong mẫu; khi bằng nhau dùng mã danh tính ổn định. Bảng đặt cạnh nhau theo danh tính, không xếp ưu tiên.</p><p>Doanh thu nhóm trong mẫu: ${n(metric(`${id}.total`))}; doanh thu tập đã chọn: ${n(metric(`${id}.selected`))}.${sources}</p>${table}</div>`;
  }).join('');
  const additions = snapshot.input.ownerAdditions.length
    ? `<ul>${snapshot.input.ownerAdditions.map(value => `<li>Đối tượng nguồn: ${text(sourceMemberLabel(value))}</li>`).join('')}</ul>`
    : '<p>Chưa có bổ sung của chủ.</p>';
  const exclusions = snapshot.frames.flatMap(frame => frame.excluded).length;
  bundle.set('peers.excluded', exclusions, 'num');
  const trace = snapshot.frames.flatMap(frame => frame.excluded.map(row => `<li><code>${esc(row.reason)}</code> ${row.source === null ? 'Chưa có nguồn' : sourceMark(row.source)}</li>`)).join('');
  return `${body}<h3>Bổ sung của chủ, giữ riêng</h3>${additions}<p>Bổ sung không thay đổi mẫu số hoặc quy tắc mặc định. Không suy cùng thương hiệu hay gian hàng từ tên giống nhau giữa các sàn.</p><p>Số lần loại dòng ở các nhóm và sàn: ${n(metric('peers.excluded'))}; lý do và vị trí được giữ trong hồ sơ đối chiếu.</p><details><summary>Hồ sơ đối chiếu tập đối thủ</summary><p>Phiên bản quy tắc: <code>${esc(snapshot.input.rule.version)}</code>. Đầu vào, thành viên và kết quả chính xác được giữ trong bản lưu bất biến của báo cáo.</p><ul>${trace}</ul></details>`;
}
