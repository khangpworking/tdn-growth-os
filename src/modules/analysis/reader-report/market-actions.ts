/**
 * Phần 11/12 of the Market reader: per-platform signals read from the sample
 * rows and the three proposal options plus no-cost quick wins built on them.
 * Every figure is observed in-sample revenue of one platform; platforms are
 * never summed, and no budget, uplift or forecast is produced.
 */
export type ActionPlatform = 'shopee' | 'tiktok';
/** `unitPrice` (from market-title-quantity.ts) is set only by the current reader; legacy readers group on revenue per unit sold. */
export type ActionRow = { readonly platform: string; readonly rev: number | null | undefined; readonly units: number | null | undefined; readonly title?: string; readonly unitPrice?: number | null };
export type PriceBand = { readonly low: number; readonly high: number; readonly revenue: number; readonly count: number };
export type RevenueGroup = { readonly revenue: number; readonly count: number };
export type PlatformSignal = { readonly platform: ActionPlatform; readonly name: string; readonly band: PriceBand | null; readonly leaders: RevenueGroup | null };
export type ActionOption = { readonly name: string; readonly related: readonly string[]; readonly firstStep: string; readonly owner: string; readonly deadline: string };
export type QuickWin = { readonly task: string; readonly owner: string; readonly deadline: string; readonly output: string };
export type MarketActionPlan = { readonly signals: readonly PlatformSignal[]; readonly options: readonly ActionOption[]; readonly quickWins: readonly QuickWin[]; readonly hasFigures: boolean };

const PLATFORMS: readonly ActionPlatform[] = ['shopee', 'tiktok'];
const NAMES: Readonly<Record<ActionPlatform, string>> = { shopee: 'Shopee', tiktok: 'TikTok Shop' };
/** Rows needed before a sample is cut into three price groups. */
const MIN_BAND_ROWS = 6;
/** Size of the high-revenue product group used by options B and C. */
const LEADER_COUNT = 5;

const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
export const vnd = (value: number): string => Math.round(value).toLocaleString('vi-VN');

/** One shared grouping basis; keep raw revenue for the legacy winning-band tie rule. */
function priceGroups(rows: readonly ActionRow[], byUnit = false) {
  const priced = rows.flatMap(row => !positive(row.rev) ? [] : byUnit ? positive(row.unitPrice) ? [{ rev: row.rev, asp: row.unitPrice }] : []
    : positive(row.units) ? [{ rev: row.rev, asp: row.rev / row.units }] : [])
    .sort((a, b) => a.asp - b.asp || a.rev - b.rev);
  const cuts = [0, Math.floor(priced.length / 3), Math.floor((2 * priced.length) / 3), priced.length];
  return { eligible: priced.length, groups: priced.length < MIN_BAND_ROWS ? [] : [0, 1, 2].map(index => priced.slice(cuts[index], cuts[index + 1])) };
}
const priceBand = (group: readonly { rev: number; asp: number }[]): PriceBand => ({
  low: Math.round(group[0]!.asp), high: Math.round(group[group.length - 1]!.asp), revenue: Math.round(sum(group.map(row => row.rev))), count: group.length,
});

/** The same three equal-count groups used by platformSignals, with their eligible denominator. */
export function platformPriceBands(rows: readonly ActionRow[], byUnit = false): { platform: ActionPlatform; name: string; bands: PriceBand[]; eligible: number; retained: number }[] {
  return PLATFORMS.filter(platform => rows.some(row => row.platform === platform)).map(platform => {
    const own = rows.filter(row => row.platform === platform);
    const { eligible, groups } = priceGroups(own, byUnit);
    const bands = groups.map(priceBand);
    return { platform, name: NAMES[platform], bands, eligible, retained: own.length };
  });
}

/** Per platform: the price group (of three, by revenue per unit sold) carrying the most in-sample revenue, and the high-revenue product group. */
export function platformSignals(rows: readonly ActionRow[], byUnit = false): PlatformSignal[] {
  return PLATFORMS.filter(platform => rows.some(row => row.platform === platform)).map(platform => {
    const own = rows.filter(row => row.platform === platform);
    const { groups } = priceGroups(own, byUnit);
    // A tie keeps the lower price group, using unrounded revenue.
    const band = groups.length ? priceBand(groups.reduce((top, group) => sum(group.map(row => row.rev)) > sum(top.map(row => row.rev)) ? group : top)) : null;
    const sold = own.flatMap(row => positive(row.rev) ? [row.rev] : []).sort((a, b) => b - a);
    const top = sold.slice(0, LEADER_COUNT);
    const leaders = sold.length >= 2 ? { revenue: Math.round(sum(top)), count: top.length } : null;
    return { platform, name: NAMES[platform], band, leaders };
  });
}

/** dd/mm/yyyy of a yyyy-mm-dd day plus whole days, in UTC date arithmetic. */
export function dayPlus(isoDay: string, days: number): string {
  const time = Date.parse(`${isoDay}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(isoDay) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== isoDay)
    throw new RangeError('INVALID_ACTION_START_DAY');
  const [year, month, day] = new Date(time + days * 86_400_000).toISOString().slice(0, 10).split('-');
  if (!/^\d{4}$/u.test(year!)) throw new RangeError('INVALID_ACTION_START_DAY');
  return `${day}/${month}/${year}`;
}

/** Pick a retained calendar day that can support every deadline, without guessing today's date. */
export function actionStartDay(...candidates: readonly (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { dayPlus(candidate, 14); return candidate; } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
  }
  return null;
}

/** yyyy-mm-dd of a dd/mm/yyyy reader date. */
export function isoFromReaderDay(readerDay: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(readerDay);
  if (!match) throw new RangeError('INVALID_ACTION_START_DAY');
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export const ACTION_LEAD = 'Ba phương án dưới đây là đề xuất của TDN, chờ chủ duyệt. “Doanh thu liên quan” là doanh thu quan sát trong mẫu của nhóm sản phẩm mà phương án nhắm tới, ghi riêng từng sàn, không phải doanh thu kỳ vọng.';
export const ACTION_NOTE = 'Phương án, người phụ trách và hạn là đề xuất của TDN, chờ chủ duyệt; chủ dự án có thể sửa. Phương án C phụ thuộc nhóm sản phẩm của phương án B. Chưa gán ngân sách hay mức tăng doanh số vì báo cáo chưa có giá vốn và chưa dự báo.';
export const QUICK_WIN_HEADING = 'Làm ngay (không tốn chi phí)';
export const OPPORTUNITY_READING = 'Mỗi sàn đọc riêng: sản phẩm có cả doanh thu và đơn vị bán được chia theo giá thành ba nhóm gần bằng nhau về số sản phẩm, và khoảng giá ở bảng là nhóm có doanh thu lớn trong ba nhóm đó. Nhóm sản phẩm doanh thu lớn gồm tối đa năm sản phẩm của sàn đó. Hai nhóm có thể trùng sản phẩm, nên mỗi cột chỉ đọc riêng.';

export const OPPORTUNITY_UNIT_READING = 'Mỗi sàn đọc riêng: sản phẩm quy đổi được theo quy cách trong tên sản phẩm được chia theo giá quy đổi thành ba nhóm gần bằng nhau về số sản phẩm, và khoảng giá ở bảng là nhóm có doanh thu lớn trong ba nhóm đó. Nhóm sản phẩm doanh thu lớn gồm tối đa năm sản phẩm của sàn đó. Hai nhóm có thể trùng sản phẩm, nên mỗi cột chỉ đọc riêng.';

export function opportunityExplanation(hasFigures: boolean, reviewsCollected: boolean, currentReader = false): string {
  if (currentReader) return hasFigures
    ? 'Các khoảng giá được đọc riêng từng sàn từ giá đã quy đổi theo quy cách trong tên sản phẩm. Các đề xuất ở Phần 12 là những bước kiểm tra kinh doanh, chờ chủ duyệt; chưa xác định khả năng sinh lời.'
    : 'Chưa đủ dữ liệu để nêu cơ hội theo khoảng giá trong mẫu.';
  const reviews = reviewsCollected ? 'Lần chạy này đã thu đánh giá của khách; điểm khen và chê được đọc ở phương án C, Phần 12.'
    : 'Lần chạy này chưa thu đánh giá của khách, nên chưa biết khách chưa hài lòng ở điểm nào.';
  return (hasFigures
    ? 'Hai cơ hội đọc từ doanh thu quan sát trong mẫu: bán trong khoảng giá có doanh thu lớn, và cạnh tranh với nhóm sản phẩm doanh thu lớn. Chưa có giá vốn nên chưa biết cơ hội nào có lãi. '
    : 'Chưa đủ dữ liệu để nêu cơ hội trong mẫu. ') + reviews;
}

/** Raw-series reports (owner F118/F119, 23/10/2026): no price from revenue ÷ units, so no price groups. */
export const NO_DERIVED_PRICE = 'Báo cáo không tính giá từ doanh thu chia lượt bán, nên không chia khoảng giá.';

/** Three options (A–C) with in-sample related revenue per platform, plus quick wins; dates count from `startDay` (yyyy-mm-dd). */
export function marketActionPlan(rows: readonly ActionRow[], { reviewsCollected, startDay, currentReader = false, unitStandard, withoutAveragePrice = false }: { reviewsCollected: boolean; startDay: string | null; currentReader?: boolean; unitStandard?: string | null; withoutAveragePrice?: boolean }): MarketActionPlan {
  // undefined keeps revenue per unit sold; a string or null means title-unit prices (null = no comparison).
  const byUnit = currentReader && unitStandard !== undefined;
  const signals = platformSignals(rows, byUnit).map(signal => currentReader && signal.band && (withoutAveragePrice || signal.band.low <= 0 || signal.band.high <= 0)
    ? { ...signal, band: null } : signal);
  const day = actionStartDay(startDay);
  const deadline = (days: number): string => day === null ? 'Chưa có ngày bắt đầu hợp lệ' : dayPlus(day, days);
  if (currentReader) {
    const related = signals.length ? signals.map(({ name, band }) => band
      ? `${name}: khoảng giá ${vnd(band.low)}–${vnd(band.high)} ${byUnit ? unitStandard : 'VND mỗi đơn vị bán'}; ${band.count} sản phẩm, doanh thu nhóm ${vnd(band.revenue)} VND`
      : `${name}: ${withoutAveragePrice ? NO_DERIVED_PRICE : missingBandText(byUnit, unitStandard)}`) : ['Chưa đủ dữ liệu giá để xác định khoảng giá theo sàn'];
    const options: ActionOption[] = [
      { name: 'A. Kiểm tra mức giá dự kiến trong khoảng giá của mẫu', related,
        firstStep: 'Đối chiếu mức giá dự kiến với khoảng giá cùng sàn; trình chủ duyệt trước khi thay đổi giá',
        owner: 'Chủ dự án (đề xuất, chờ chủ duyệt)', deadline: deadline(7) },
      { name: 'B. Kiểm tra quy cách chào bán trong khoảng giá của mẫu', related,
        firstStep: 'Đối chiếu quy cách đã xác minh của tối đa năm sản phẩm cùng sàn và khoảng giá; trình chủ duyệt quy cách cần xem xét',
        owner: 'TDN chuẩn bị; chủ dự án duyệt (đề xuất, chờ chủ duyệt)', deadline: deadline(7) },
      { name: 'C. Kiểm tra điều kiện bán trong khoảng giá của mẫu', related,
        firstStep: 'Đối chiếu điều kiện giao hàng và đổi trả đã lưu của tối đa năm sản phẩm cùng sàn và khoảng giá; trình chủ duyệt điều kiện cần xem xét',
        owner: 'TDN chuẩn bị; chủ dự án duyệt (đề xuất, chờ chủ duyệt)', deadline: deadline(14) },
    ];
    const quickWins: QuickWin[] = [
      { task: 'Kiểm tra mức giá dự kiến cho một quy cách đã xác minh', owner: 'Chủ dự án (đề xuất, chờ chủ duyệt)', deadline: deadline(3), output: 'Một mức giá để chủ xem xét; chưa áp dụng thay đổi' },
      { task: 'Kiểm tra một điều kiện giao hàng hoặc đổi trả dự kiến', owner: 'Chủ dự án (đề xuất, chờ chủ duyệt)', deadline: deadline(3), output: 'Một điều kiện bán để chủ xem xét; chưa áp dụng thay đổi' },
    ];
    return { signals, options, quickWins, hasFigures: signals.some(signal => signal.band !== null) };
  }
  const bandLines = signals.map(({ name, band }) => band
    ? `${name}: ${vnd(band.revenue)} VND từ ${band.count} sản phẩm giá ${vnd(band.low)}–${vnd(band.high)} VND mỗi đơn vị bán`
    : `${name}: chưa đủ dòng có cả doanh thu và đơn vị bán`);
  const leaderLines = signals.map(({ name, leaders }) => leaders
    ? `${name}: ${vnd(leaders.revenue)} VND từ ${leaders.count} sản phẩm doanh thu lớn`
    : `${name}: chưa đủ sản phẩm có doanh thu`);
  const none = ['Chưa có dòng doanh thu trong mẫu'];
  const options: ActionOption[] = [
    { name: 'A. Bán trong khoảng giá có doanh thu lớn trong mẫu', related: bandLines.length ? bandLines : none,
      firstStep: 'So giá vốn dự kiến với khoảng giá này; báo cáo chưa có giá vốn nên chưa tính lãi',
      owner: 'Chủ dự án quyết; TDN chuẩn bị số liệu (đề xuất, chờ chủ duyệt)', deadline: deadline(7) },
    { name: 'B. Làm sản phẩm cạnh tranh trực tiếp với nhóm sản phẩm doanh thu lớn trong mẫu', related: leaderLines.length ? leaderLines : none,
      firstStep: 'So tính năng, quy cách và giá của các sản phẩm này trên trang bán; không mua hàng',
      owner: 'TDN chuẩn bị; chủ dự án xem (đề xuất, chờ chủ duyệt)', deadline: deadline(7) },
    { name: 'C. Khác biệt bằng điểm khách chưa hài lòng ở nhóm sản phẩm của phương án B', related: ['Cùng nhóm sản phẩm với phương án B; không cộng thêm'],
      firstStep: reviewsCollected ? 'Đọc đánh giá đã lưu của nhóm này, ghi điểm khách khen và chê'
        : 'Thu đánh giá của 5–10 sản phẩm ở phương án B trước; lần chạy này chưa thu đánh giá',
      owner: 'TDN thu và đọc; chủ dự án duyệt (đề xuất, chờ chủ duyệt)', deadline: deadline(14) },
  ];
  const quickWins: QuickWin[] = [
    { task: 'Viết câu hỏi kinh doanh cho báo cáo (1–2 câu)', owner: 'Chủ dự án (đề xuất, chờ chủ duyệt)', deadline: deadline(3),
      output: 'Câu hỏi bằng văn bản, nêu quyết định cần ra' },
    { task: 'Xem nhãn phân loại sản phẩm trong mẫu', owner: 'Chủ dự án duyệt; TDN sửa (đề xuất, chờ chủ duyệt)', deadline: deadline(3),
      output: 'Nhãn đúng hoặc sai trên danh sách sản phẩm' },
  ];
  return { signals, options, quickWins, hasFigures: signals.some(signal => signal.band || signal.leaders) };
}

export const OPTION_HEADINGS = ['Phương án', 'Doanh thu liên quan trong mẫu', 'Bước kiểm đầu tiên', 'Người phụ trách', 'Hạn'] as const;
export const QUICK_WIN_HEADINGS = ['Việc', 'Người phụ trách', 'Hạn', 'Đầu ra'] as const;
/** Band cell when a platform has no price group; title-unit wording only when `byUnit`. */
export function missingBandText(byUnit: boolean, unitStandard: string | null | undefined): string {
  if (!byUnit) return 'chưa đủ dữ liệu giá để xác định khoảng giá';
  return unitStandard ? 'chưa đủ dữ liệu giá quy đổi được để chia khoảng giá' : 'chưa so giá giữa các sản phẩm vì quy cách khác nhau hoặc không ghi trong tên sản phẩm';
}

export const OPPORTUNITY_HEADINGS = ['Sàn', 'Khoảng giá có doanh thu lớn (VND mỗi đơn vị bán)', 'Doanh thu của khoảng giá (VND)', 'Số sản phẩm trong khoảng giá',
  'Doanh thu của nhóm sản phẩm doanh thu lớn (VND)', 'Số sản phẩm trong nhóm'] as const;

/** Current reader: the price column names the title-unit standard. */
export const opportunityHeadings = (unitStandard: string): readonly string[] =>
  OPPORTUNITY_HEADINGS.map((heading, index) => index === 1 ? `Khoảng giá có doanh thu lớn (${unitStandard})` : heading);

/** Cell text of the per-platform opportunity table (escaped by the caller). */
export function opportunityRows(signals: readonly PlatformSignal[], missingBand = 'chưa đủ dòng có cả doanh thu và đơn vị bán'): string[][] {
  const missing = 'chưa có dữ liệu';
  return signals.map(({ name, band, leaders }) => [name,
    band ? `${vnd(band.low)}–${vnd(band.high)}` : missingBand, band ? vnd(band.revenue) : missing, band ? String(band.count) : missing,
    leaders ? vnd(leaders.revenue) : missing, leaders ? String(leaders.count) : missing]);
}
