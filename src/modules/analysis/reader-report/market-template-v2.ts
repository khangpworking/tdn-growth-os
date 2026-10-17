import type { ReaderReportData } from './build.js';
import { completeSum } from './nullable-metrics.js';
import { readerPeerExhibit } from './default-peers.js';
import { lineChart } from './svg-charts.js';
import { renderChart, type FlintChartInput } from './flint.js';
import { marketChartRows, renderMarketCharts, renderSearchInterestChart } from './market-charts.js';
import { renderComtradeCharts, renderWorldBankCharts, type MacroChart } from './macro-charts.js';
import { searchInterestChartPoints, searchInterestRenderable, SEARCH_INTEREST_FIGURE_TITLE, SEARCH_INTEREST_LIMIT, SEARCH_INTEREST_NOTE, SEARCH_INTEREST_SOURCE_LABEL, SEARCH_INTEREST_SRC, SEARCH_INTEREST_UNIT } from '../research-automation/search-interest.js';
import { formatWorldBankValue, worldBankRenderableRows, worldBankSourceNote, worldBankUnitText, WORLD_BANK_LIMIT, WORLD_BANK_NOTE, WORLD_BANK_SOURCE_LABEL, WORLD_BANK_SRC, WORLD_BANK_TITLE } from '../research-automation/world-bank-lane.js';
import { E12_ATTRIBUTION, E13_ATTRIBUTION, E14_ATTRIBUTION } from '../source-appendix-projection.js';
import { officialStatsCitation, officialStatsCitationSheet, officialStatsNotice, officialStatsRenderableRows, officialStatsRowLabel, officialStatsStatusText, officialStatsUnitText, officialStatsValueText, OFFICIAL_STATS_LIMIT, OFFICIAL_STATS_NOTE, OFFICIAL_STATS_SRC, OFFICIAL_STATS_TABLE_TEXT, OFFICIAL_STATS_TABLE_TITLE } from '../research-automation/official-statistics-lane.js';
import { comtradeFlowText, comtradeNotice, comtradeOfficialText, comtradeRenderableRows, comtradeRowNote, comtradeSideText, COMTRADE_LIMIT, COMTRADE_NOTE, COMTRADE_SOURCE_LABEL, COMTRADE_SRC, COMTRADE_TABLE_TITLE } from '../research-automation/comtrade-lane.js';
import { searchAdsBrandNotice, searchAdsNotice, searchAdsOkBrands, SEARCH_ADS_NOTE, SEARCH_ADS_SOURCE_LABEL, SEARCH_ADS_SOURCE_NOTE, SEARCH_ADS_TABLE_TITLE } from '../research-automation/google-ads-lane.js';
import { pdfExcerptBlockHtml, pdfExcerptCitation, PDF_EXCERPT_NOTE, PDF_EXCERPT_SRC } from '../research-automation/pdf-excerpt.js';
import { sellerVideoBlockHtml, sellerVideoNote, sellerVideoSrc } from '../research-automation/seller-video.js';
import { metaAdCitation, metaAdDate, META_AD_NAME_WITHHELD, META_AD_NOTE, META_AD_SOURCE_LABEL, META_AD_SOURCE_NOTE, META_AD_SRC, META_AD_TEXT_WITHHELD, META_AD_TITLE } from '../research-automation/meta-ad-report.js';
import { metaAutoNote, META_AUTO_CITATION_LABEL, META_AUTO_EXCERPT, META_AUTO_MISSING, META_AUTO_NAME_SUFFIX, META_AUTO_SAME_DAY, META_AUTO_SOURCE_LABEL, META_AUTO_SOURCE_NOTE, META_AUTO_SRC, META_AUTO_TABLE_TITLE } from '../research-automation/meta-auto-lane.js';
import { tiktokTopAdsNote, TIKTOK_TOP_ADS_CITATION_LABEL, TIKTOK_TOP_ADS_HEADERS, TIKTOK_TOP_ADS_MISSING, TIKTOK_TOP_ADS_SOURCE_LABEL, TIKTOK_TOP_ADS_SOURCE_NOTE, TIKTOK_TOP_ADS_SRC, TIKTOK_TOP_ADS_TABLE_TITLE } from '../research-automation/tiktok-top-ads-lane.js';
import { Narrator } from './bundle.js';
import { esc } from './format.js';
import { cover, makeExhibits, n, page, plat, platIcons, PLATFORM_LABEL, section as legacySection } from './layout.js';
import { currentProposals } from './market-proposals.js';
import { MARKET_TOC, readerWebResults, type BuiltMarketReport, type MarketReportOptions, type ReaderWebResult } from './market-template.js';
import { CitationRegistry } from '../citation-registry.js';
import { renderCitationMark, renderCitationRegister } from '../citation-register-html.js';
import type { MetricWebCellFact, MetricWebTableFact } from '../research-automation/metric-web-facts.js';
import { classifyWebPage, WEB_PAGE_TYPE_LABEL } from '../research-automation/web-page-type.js';
import { EXPANDED_SEARCH_COLUMN, EXPANDED_SEARCH_LABEL, EXPANDED_SEARCH_NOTE } from '../research-automation/expanded-search-lane.js';
import { MARKET_SALES_AVERAGE_EXHIBIT, marketFindings } from './market-findings.js';

const PLATFORM_COLORS = { shopee: '#c2410c', tiktok: '#1d2327' } as const;

/** Missing-input projection. No chart fabricates a zero bar for an unobserved value. */
export async function buildMarketReportV2(d: ReaderReportData, options: MarketReportOptions): Promise<BuiltMarketReport> {
  const { input, profile, rows, bundle: B } = d, PLATS = input.platforms;
  const next = input.contractVersion === '1.4.0';
  // Legacy 1.2/1.3 rows that fall back to this path keep their frozen bytes under the flint:false
  // opt-out (the legacy hash fixture pins them); Flint charts and markers apply everywhere else.
  const flintMarks = next || options.flint !== false;
  const narrator = new Narrator(B), registry = new CitationRegistry(), extraOk = new Set<string>();
  const label = (s: string): string => { if (/\d/.test(s)) extraOk.add(s); return esc(s); };
  const source = input.source!;
  const period = `${source.measurementPeriod.start.split('-').reverse().join('/')} – ${source.measurementPeriod.end.split('-').reverse().join('/')}`;
  const sourceText = next
    ? `Dữ liệu bán hàng ước tính trên từng sàn, ${period}; trong mẫu gồm n = ${rows.length} sản phẩm đã lưu.`
    : `Dữ liệu bán hàng ước tính trên từng sàn, ${period}; trong mẫu sản phẩm đã lưu.`;
  const { tbl, fig } = makeExhibits(sourceText);
  const section = (id: string, title: string, headline: string, body: string, limits?: string): string =>
    next ? legacySection(id, title, headline, body, limits, { noteLabel: 'Chú thích' }) : legacySection(id, title, headline, body, limits);
  const cite = (i?: number): string => {
    if (input.rowLineage === undefined) return '<span class="no-source">Chưa có nguồn</span>';
    const no = registry.cite({ sourceKind: 'METRIC_ROW', identity: input.rowLineage.sha256,
      locator: i === undefined ? null : next ? { kind: 'source-locator', value: `dòng sản phẩm ${i + 1}` } : { kind: 'xlsx', sheet: 'Sheet1', cell: `A${i + 2}:T${i + 2}` },
      ...(next && i !== undefined ? { technical: { locator: `Sheet1!A${i + 2}:T${i + 2}` } } : {}),
      label: i === undefined ? 'Số liệu đã tính từ nguồn đã lưu' : 'Dòng số liệu nguồn', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return no === null ? '<span class="no-source">Chưa có nguồn</span>' : renderCitationMark(no);
  };
  const pendingId = (id: string): boolean => next && profile.status === 'proposed' && !id.endsWith('.threshold') && /\.core\.|\.seg\.|\.coh\.|^shop\.|^peers\.|^rule\./.test(id);
  const bf = (id: string): string => (pendingId(id) && B.value(id) !== null
    ? `<span data-classified="pending">${B.f(id)}</span> (đề xuất, chờ chủ duyệt)` : B.f(id)) + cite();
  const nar = (template: string, where: string): string => {
    const pending = [...template.matchAll(/\{\{([^}:]+)/g)].some(m => pendingId(m[1]!));
    const text = narrator.nar(pending ? template.replace(/\.$/, '') + ' (đề xuất, chờ chủ duyệt).' : template, where);
    return (pending ? `<span data-classified="pending">${text}</span>` : text) + cite();
  };
  const segName = (k: string): string => profile.segments[k] ?? k;
  const status = profile.status === 'approved' ? 'đã được chủ duyệt' : 'đề xuất, chờ chủ duyệt';
  const sections: string[] = [], charts: BuiltMarketReport['charts'] = [];
  const summary = next ? '' : PLATS.map(P => nar(`${PLATFORM_LABEL[P]}: {{${P}.core.rev}} doanh thu, {{${P}.core.units}} đơn vị bán trong mẫu`, `M01.${P}`)).join('; ');
  if (next) {
    const findings = marketFindings(d);
    const groups = profile.core.map(k => label(segName(k))).join('; ');
    sections.push(section('M01', 'Kết luận chính', 'Các nhận định mô tả mẫu đã lưu, không sắp theo mức quan trọng.',
      `<p>Phạm vi: trong mẫu sản phẩm đã lưu; kỳ ${period}; sản phẩm ${label(profile.product)}; nhóm lõi theo thứ tự hồ sơ: ${groups}. Mỗi sàn giữ riêng.</p>` +
      `<ul class="market-findings">${findings.map(finding => `<li><p><b>Nhận định:</b> ${nar(finding.template, `M01.finding.${finding.id}`)}</p><p><b>Bằng chứng:</b> ${finding.exhibit}${cite()}.</p><p><b>Trạng thái:</b> ${finding.classified && profile.status === 'proposed' ? 'Phân loại đề xuất, chờ chủ duyệt; số ước tính trong mẫu.' : 'Quan sát mô tả từ bản lưu; số bán hàng là ước tính.'} Phạm vi ${label(profile.product)}, nhóm ${groups}, kỳ ${period}.</p></li>`).join('')}</ul>` +
      (findings.length < 4 ? '<p>Chưa đủ bằng chứng để có bốn nhận định; không bổ sung nhận định không có nguồn. Phần kết luận còn thiếu.</p>' : '') +
      '<p>Số ước tính chưa đối chiếu với người bán. Không suy ra số người mua, quy mô ngoài mẫu hay nguyên nhân.</p>', sourceText));
  } else sections.push(section('M01', 'Kết luận chính', summary,
    `<p>Thiếu dữ liệu được ghi riêng, không thay bằng số không. Nhóm sản phẩm ${status}.</p><p>${PLATS.map(P => profile.core.map(k => nar(`${PLATFORM_LABEL[P]} · ${label(segName(k))}: {{${P}.seg.${k}.revShare}} doanh thu lõi trong mẫu`, `M01.group.${P}.${k}`)).join('; ')).join('<br>')}. → Bảng 4.1</p><p>Ngày mở bán chưa rõ: xem Bảng 6.1. Phương án ở Phần 12 đều chờ chủ duyệt.</p>`, sourceText));
  const reconciliation = d.webReconciliation.map(warning => `<p>${esc(warning.detail)}</p>`).join('');
  const reconciliationState = d.webFacts === null ? '' : '<p>Đối chiếu riêng từng sàn: doanh thu thiếu ở một dòng làm phép đối chiếu của sàn đó chưa xác định. Các sàn đủ số vẫn được kiểm tra; không cộng chéo sàn để đối chiếu.</p>';
  sections.push(section('M02', 'Phạm vi và phương pháp', `Kỳ ${period}; mỗi sàn là một phạm vi riêng.`,
    tbl('2.1', 'Phạm vi và độ phủ số liệu', '', ['Sàn', 'Dòng nguồn', 'Thiếu doanh thu', 'Doanh thu bằng không', 'Thiếu đơn vị bán', 'Đơn vị bán bằng không'],
      PLATS.map(P => [plat(P), n(bf(`${P}.all.n`)), n(bf(`${P}.all.rev.missing`)), n(bf(`${P}.all.rev.zero`)), n(bf(`${P}.all.units.missing`)), n(bf(`${P}.all.units.zero`))])) +
    tbl('2.2', `Quy tắc phân loại (${status})`, '', ['Nhóm', 'Quy tắc', 'Dòng khớp'], profile.rules.map((rule, i) => {
      B.set(`rule.${i}.n`, d.ruleHits[i] ?? 0, 'num'); return [label(segName(rule.seg)), label(rule.why ?? 'Luật khớp đầu tiên của hồ sơ đã lưu'), n(bf(`rule.${i}.n`))];
    })) + options.limitations.map(limit => `<p>${esc(limit)}</p>`).join('') + reconciliationState + reconciliation,
    'Chưa đủ căn cứ về kỳ, múi giờ, khung mẫu và tính rời nhau để cộng chéo sàn. Tổng và tỷ lệ cần đủ dữ liệu của đúng phạm vi.'));
  const salesTable = (no: string) => tbl(no, next ? 'Doanh số trong mẫu và giá trung bình từ dữ liệu bán hàng, từng sàn' : 'Doanh số trong mẫu, từng sàn', '',
    next ? ['Sàn', 'Doanh thu ước tính', 'Đơn vị bán ước tính', 'Giá trung bình từ doanh thu ÷ đơn vị bán'] : ['Sàn', 'Doanh thu ước tính', 'Đơn vị bán ước tính', 'Giá trung bình'],
    PLATS.map(P => [plat(P), n(bf(`${P}.core.rev`)), n(bf(`${P}.core.units`)), n(bf(`${P}.core.asp`))]));
  let monthly = '';
  if (d.webFacts !== null && !('absent' in d.webFacts.monthly)) {
    const facts = d.webFacts, groups = d.webFacts.monthly;
    const months = [...new Set(Object.values(groups).flatMap(group => Object.keys(group ?? {})))].sort();
    const no = registry.cite({ sourceKind: 'CAPTURE', identity: input.webSnapshotSha256!, locator: { kind: 'source-locator', value: 'số liệu theo tháng' }, label: 'Trang kết quả tìm kiếm: số liệu theo tháng', retrievedAt: facts.capturedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    const mark = no === null ? '' : renderCitationMark(no);
    const monthValue = (P: typeof PLATS[number], month: string): number | null => { const value = groups[P]?.[month]?.revenue.value; return value === null || value === undefined ? null : value / 1e9; };
    const fallback = (): string => lineChart(months, PLATS.map(P => ({ name: PLATFORM_LABEL[P]!, color: PLATFORM_COLORS[P], values: months.map(month => monthValue(P, month)) })));
    const drawn = !months.length ? null : options.flint === false ? { svg: fallback(), engine: 'svg-fallback' as const } : await renderChart({
      data: { values: PLATS.flatMap(P => months.map(month => { const value = monthValue(P, month); return { thang: month, san: PLATFORM_LABEL[P]!, doanh_thu: value === null ? null : +value.toFixed(3) }; })) },
      semantic_types: { thang: 'Category', san: 'Category', doanh_thu: 'Number' },
      field_display_names: { thang: 'Tháng', san: 'Sàn', doanh_thu: 'Doanh thu (tỷ đồng)' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'thang', y: 'doanh_thu', color: 'san' } },
    } as FlintChartInput, fallback, { palette: { san: { Shopee: PLATFORM_COLORS.shopee, 'TikTok Shop': PLATFORM_COLORS.tiktok } } });
    if (drawn) monthly = fig('3.1', 'Doanh thu theo tháng, từng sàn (toàn kết quả tìm kiếm)', 'tỷ đồng', drawn.svg, { ...(flintMarks ? { engine: drawn.engine } : {}), src: 'Trang kết quả tìm kiếm đã lưu (toàn kết quả tìm kiếm)' + mark, note: 'Tháng thiếu có khoảng trống; mỗi sàn giữ riêng.' }) + tbl('3.2', 'Doanh thu theo tháng (toàn kết quả tìm kiếm)', '', ['Sàn', 'Tháng', 'Doanh thu'], PLATS.flatMap(P => months.map(month => {
      const id = `web.${P}.m.${month}`;
      return [plat(P), label(month), (B.has(id) ? n(B.f(id)) : 'Chưa có dữ liệu') + mark];
    })), { src: 'Trang kết quả tìm kiếm đã lưu (toàn kết quả tìm kiếm)' + mark });
    if (drawn) charts.push({ id: 'M03.monthly', engine: drawn.engine, ...(drawn.error ? { error: drawn.error } : {}) });
  }
  sections.push(section('M03', 'Quy mô và diễn biến', monthly ? 'Doanh số trong mẫu và chuỗi trên trang nguồn giữ riêng; có số theo tháng cho từng sàn ở Hình 3.1.' : 'Chỉ mô tả doanh số trong mẫu; chưa có chuỗi phù hợp để xác định diễn biến.', salesTable(MARKET_SALES_AVERAGE_EXHIBIT) + monthly, 'Một thành viên thiếu làm tổng chưa xác định; mẫu số bằng không không tạo ra giá trung bình.'));
  // The three required charts come from the same saved product rows as the appendix.
  const chartRows = marketChartRows(rows);
  const required = !flintMarks ? [] : await renderMarketCharts(rows, { flint: options.flint !== false, rowListNote: 'số dòng khớp chú dẫn “dòng sản phẩm” của nguồn' });
  const requiredFig = (kind: 'concentration' | 'platform-revenue' | 'product-ranking', no: string): string => {
    const found = required.find(c => c.kind === kind);
    if (found === undefined) return '';
    charts.push({ id: found.id, engine: found.engine, ...(found.error ? { error: found.error } : {}) });
    return fig(no, found.title, found.unit, found.svg, { engine: found.engine, note: found.note });
  };
  const m04Charts = requiredFig('platform-revenue', '4.1') + requiredFig('concentration', '4.2');
  sections.push(section('M04', 'Cơ cấu thị trường', 'Các nhóm đặt cạnh nhau theo quy tắc phân loại, tính riêng từng sàn.',
    m04Charts + tbl('4.1', 'Cơ cấu doanh số trong mẫu theo nhóm', '', ['Sàn', 'Nhóm', 'Doanh thu', 'Đơn vị bán', 'Tỷ trọng doanh thu lõi'], PLATS.flatMap(P => profile.core.map(k => [plat(P), label(segName(k)), n(bf(`${P}.seg.${k}.rev`)), n(bf(`${P}.seg.${k}.units`)), n(bf(`${P}.seg.${k}.revShare`))]))), 'Tỷ trọng trong mẫu; không phải thị phần.'));
  // The stored search-interest series is drawn only here, on its own axis; the same predicate marks the source as used.
  const interest = next && searchInterestRenderable(options.searchInterest) ? options.searchInterest : undefined;
  const interestChart = interest ? await renderSearchInterestChart(searchInterestChartPoints(interest), { flint: options.flint !== false }) : undefined;
  if (interestChart) charts.push({ id: 'M05.search-interest', engine: interestChart.engine, ...(interestChart.error ? { error: interestChart.error } : {}) });
  // Open country-level figures sit beside the sales numbers in M05 (the context section that already holds the search-interest
  // figure). M10 is "Chưa dự báo", where a macro figure would read as a forecast basis. The same predicate marks S23 as used.
  const worldBankRows = next ? worldBankRenderableRows(options.worldBank) : [];
  const worldBankTable = worldBankRows.length === 0 ? '' : tbl('5.3', WORLD_BANK_TITLE, '', ['Chỉ số', 'Nguồn', 'Giá trị', 'Năm', 'Cập nhật', 'Ghi chú của nguồn'],
    worldBankRows.map(item => {
      const no = registry.cite({ sourceKind: 'CAPTURE', identity: item.sourceSha256, locator: { kind: 'json-pointer', pointer: item.row.locator },
        label: `${E13_ATTRIBUTION}, ${item.row.indicatorName}, ${item.row.year}, cập nhật ${item.row.lastUpdated}`, technical: { indicator: item.code },
        retrievedAt: item.retrievedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
      return [label(item.row.indicatorName), esc(E13_ATTRIBUTION), label(`${formatWorldBankValue(item.row.value)} ${worldBankUnitText(item.row)}`) + (no === null ? '' : renderCitationMark(no)),
        label(item.row.year), label(item.row.lastUpdated), label(worldBankSourceNote(item.row))];
    }), { src: WORLD_BANK_SRC, note: WORLD_BANK_NOTE });
  // One yearly line per drawn indicator follows table 5.3 (Hình 5.3, 5.4 in indicator order), only from the stored series; never on a sample axis.
  const macroFig = (chart: MacroChart, no: string): string => {
    charts.push({ id: chart.id, engine: chart.engine, ...(chart.error ? { error: chart.error } : {}) });
    return fig(no, esc(chart.title), esc(chart.unit), chart.svg, { engine: chart.engine, src: esc(chart.src), note: esc(chart.note) });
  };
  const worldBankFigures = worldBankRows.length === 0 ? '' : (await renderWorldBankCharts(options.worldBank, { flint: options.flint !== false }))
    .map((chart, i) => macroFig(chart, `5.${3 + i}`)).join('');
  // Cục Thống kê figures (S21) follow table 5.3 as country background; the same predicate marks S21 as used. Never combined with sample numbers.
  // No chart for table 5.4: each run reads one month only, so there is no series to draw.
  const officialStats = next ? options.officialStats : undefined;
  const officialRows = officialStatsRenderableRows(officialStats);
  const officialTable = !officialStats ? '' : officialRows.length === 0 ? `<p>${esc(officialStatsNotice(officialStats))}</p>`
    : (officialStats.status === 'OK' ? '' : `<p>${esc(officialStatsNotice(officialStats))}</p>`) +
      tbl('5.4', OFFICIAL_STATS_TABLE_TITLE, '', ['Bảng', 'Dòng', 'Kỳ', 'Giá trị', 'Đơn vị', 'Trạng thái'],
        officialRows.map(row => {
          const file = officialStats.files.find(item => item.captureIndex === row.captureIndex);
          const citation = officialStatsCitation(officialStats, row).replace(/^[^,]+/u, E12_ATTRIBUTION);
          const no = file ? registry.cite({ sourceKind: 'CAPTURE', identity: file.sha256, locator: { kind: 'xlsx', sheet: officialStatsCitationSheet(row), cell: row.cell }, technical: { sheet: row.sheet },
            label: citation, retrievedAt: file.retrievedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' }) : null;
          return [label(OFFICIAL_STATS_TABLE_TEXT[row.table]), label(officialStatsRowLabel(row)), label(row.period), label(officialStatsValueText(row)) + (no === null ? '' : renderCitationMark(no)),
            label(officialStatsUnitText(row)), label(officialStatsStatusText(officialStats, row))];
        }), { src: OFFICIAL_STATS_SRC, note: OFFICIAL_STATS_NOTE });
  sections.push(section('M05', 'Nhu cầu (tín hiệu bán)', 'Nhu cầu, đo bằng doanh số (ước tính) trong mẫu.', salesTable('5.1') +
    (interestChart ? `<p>Kỳ ${period}; nguồn: dữ liệu bán hàng ước tính trên từng sàn. Mức quan tâm tìm kiếm ghi riêng ở Hình 5.2, là chỉ số tương đối, không cộng hay so với số bán.</p>` +
      fig('5.2', SEARCH_INTEREST_FIGURE_TITLE, SEARCH_INTEREST_UNIT, interestChart.svg, { engine: interestChart.engine, src: SEARCH_INTEREST_SRC, note: SEARCH_INTEREST_NOTE })
      : `<p>Kỳ ${period}; nguồn: dữ liệu bán hàng ước tính trên từng sàn. Mức quan tâm tìm kiếm ghi riêng, chưa có chuỗi tìm kiếm phù hợp trong bản này.</p>`) + worldBankTable + worldBankFigures + officialTable,
    'Số bán hàng ước tính chưa đối chiếu với người bán, chỉ dùng tham khảo. Không suy ra quy mô ngoài mẫu, số người mua, nhu cầu chưa được đáp ứng hay dự báo.' + (interestChart ? ` ${SEARCH_INTEREST_LIMIT}` : '') + (worldBankTable ? ` ${WORLD_BANK_LIMIT}` : '') + (officialRows.length ? ` ${OFFICIAL_STATS_LIMIT}` : '')));
  // Country-level trade figures sit in M06 as background; the same predicate marks S24 as used. No sums, shares or comparison with the sample.
  const comtrade = next ? options.comtrade : undefined;
  const comtradeRows = comtradeRenderableRows(comtrade);
  const comtradeTable = !comtrade ? '' : comtradeRows.length === 0 ? `<p>${esc(comtradeNotice(comtrade))}</p>`
    : (comtrade.status === 'OK' ? '' : `<p>${esc(comtradeNotice(comtrade))}</p>`) +
      `<p>Mã hàng ước tính: ${esc(comtrade.hsCode!)}. Mô tả chính thức (tiếng Anh): ${esc(comtradeOfficialText(comtrade))}. Diễn giải tự động: ${esc(comtrade.descriptionVi!)}</p>` +
      tbl('6.2', COMTRADE_TABLE_TITLE, '', ['Bên báo số', 'Chiều', 'Năm', 'Giá trị (USD, theo bên báo)', 'Ghi chú'],
        comtradeRows.map(row => {
          const call = comtrade.calls.find(item => item.captureIndex === row.captureIndex);
          const no = call ? registry.cite({ sourceKind: 'CAPTURE', identity: call.responseSha256, locator: { kind: 'json-pointer', pointer: '/data' },
            label: `${E14_ATTRIBUTION}, ${comtradeSideText(row)}, ${comtradeFlowText(row.flow)}, ${row.year}`, technical: { hsCode: comtrade.hsCode ?? '' },
            retrievedAt: call.retrievedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' }) : null;
          return [label(comtradeSideText(row)), label(comtradeFlowText(row.flow)), label(row.year), label(formatWorldBankValue(row.value)) + (no === null ? '' : renderCitationMark(no)), label(comtradeRowNote(row))];
        }), { src: COMTRADE_SRC, note: COMTRADE_NOTE + (comtrade.mirrorReporterCount === null || comtrade.mirrorReporterCount === 0 ? '' : ` Số nước báo số hàng xuất sang Việt Nam: ${comtrade.mirrorReporterCount}.`) });
  // Bars per reporting side follow table 6.2 (Hình 6.1, 6.2 in drawn order): mirror reporters of one year, then Việt Nam's own two flows of one year. Never summed.
  const comtradeFigures = comtradeRows.length === 0 ? '' : (await renderComtradeCharts(comtrade, { flint: options.flint !== false }))
    .map((chart, i) => macroFig(chart, `6.${1 + i}`)).join('');
  sections.push(section('M06', 'Nguồn cung', 'Giữ riêng nhãn thương hiệu theo tiêu đề người bán trên từng sàn.',
    tbl('6.1', 'Ngày mở bán và phần chưa rõ', '', ['Sàn', 'Có ngày', 'Thiếu ngày', 'Mở bán trong kỳ', 'Doanh thu mở bán trong kỳ'],
      PLATS.map(P => [plat(P), n(bf(`${P}.coh.known`)), n(bf(`${P}.coh.nodate`)), n(bf(`${P}.coh.n`)), n(bf(`${P}.coh.rev`))])) +
    `<p>Tên giống nhau không chứng minh cùng thương hiệu, người bán hay người mua giữa các sàn. Nhãn trên dòng nguồn nằm ở Phụ lục.</p>` + comtradeTable + comtradeFigures, comtradeRows.length ? COMTRADE_LIMIT : undefined));
  const shops = PLATS.flatMap(P => [...new Set(rows.filter(row => row.platform === P).map(row => row.shop))].map((shop, i) => {
    const members = rows.filter(row => row.platform === P && row.shop === shop && profile.core.includes(row.seg!));
    const rev = completeSum(members, 'rev'), units = completeSum(members, 'units'), id = `shop.${P}.${i}`;
    B.set(`${id}.n`, members.length, 'num');
    if (rev === null) B.setMissing(`${id}.rev`, 'ty'); else B.set(`${id}.rev`, rev, 'ty');
    if (units === null) B.setMissing(`${id}.units`, 'num'); else B.set(`${id}.units`, units, 'num');
    return [plat(P), label(members[0]?.shopName || shop), n(bf(`${id}.n`)), n(bf(`${id}.rev`)), n(bf(`${id}.units`))];
  }));
  const peers = readerPeerExhibit(d.defaultMarketPeers, B, { text: label, metric: bf, readerSafeText: next, sourceMark: ref => {
    const no = registry.cite({ sourceKind: 'METRIC_ROW', identity: ref.sourceSha256,
      locator: next ? null : { kind: 'source-locator', value: ref.locator }, ...(next ? { technical: { locator: ref.locator } } : {}), label: 'Dòng doanh số nguồn đã lưu',
      retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return no === null ? '<span class="no-source">Chưa có nguồn</span>' : renderCitationMark(no);
  } });
  // Confirmed Meta ad-library pages (S15) sit beside the competitor sample. Ad copy is seller text, so it stays a quotation with its capture mark;
  // with no confirmed page nothing is drawn. The same predicate marks the source as used in the source list.
  const metaAdPages = next ? options.metaAds ?? [] : [];
  const ownerMetaRows = metaAdPages.map(item => {
    const marks = item.captures.map(capture => registry.cite(metaAdCitation(capture))).map(no => no === null ? '' : renderCitationMark(no)).join('');
    return [item.pageName === null ? esc(META_AD_NAME_WITHHELD) : `<span data-quote>${esc(item.pageName)}</span>`, label(String(item.adCount)), label(metaAdDate(item.earliestStart)), label(String(item.daysRun)),
      (item.excerpt === null ? esc(META_AD_TEXT_WITHHELD) : `<span data-quote>${esc(item.excerpt)}</span>${item.excerptCut ? '…' : ''}`) + marks];
  });
  // The app's own logged-out read (S15 AUTO) adds rows to the same table; with none, the owner-only table keeps its exact bytes.
  const metaAuto = next ? options.metaAuto : undefined;
  const autoMetaRows = (metaAuto?.rows ?? []).map(row => {
    const page = `<span data-quote>${label(row.label)}</span>${row.ok ? ` ${esc(META_AUTO_NAME_SUFFIX)}` : ''}`;
    if (!row.ok) return [page, esc(META_AUTO_MISSING), esc(META_AUTO_MISSING), esc(META_AUTO_MISSING), label(row.notice ?? '')];
    const no = registry.cite({ sourceKind: 'CAPTURE', identity: row.textSha256!, locator: null, label: META_AUTO_CITATION_LABEL, retrievedAt: row.readAt,
      url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return [page, label(String(row.adCount)) + (no === null ? '' : renderCitationMark(no)), row.earliestStart === null ? esc(META_AUTO_MISSING) : label(metaAdDate(row.earliestStart)),
      row.daysRun === null ? esc(META_AUTO_MISSING) : row.daysRun === 0 ? esc(META_AUTO_SAME_DAY) : label(String(row.daysRun)), esc(META_AUTO_EXCERPT)];
  });
  const metaAdTable = autoMetaRows.length === 0
    ? (metaAdPages.length === 0 ? '' : tbl('7.2', META_AD_TITLE, '', ['Trang', 'Số quảng cáo đã xác nhận', 'Ngày bắt đầu đầu tiên', 'Số ngày đã chạy (tính tới ngày thu)', 'Trích nội dung'],
      ownerMetaRows, { src: esc(META_AD_SRC), note: esc(META_AD_NOTE) }))
    : tbl('7.2', metaAdPages.length ? `${META_AD_TITLE} và trang máy tự đọc` : META_AUTO_TABLE_TITLE, '',
      ['Trang', 'Số quảng cáo', 'Ngày bắt đầu đầu tiên', 'Số ngày đã chạy (tính tới ngày thu hoặc ngày đọc)', 'Trích nội dung'], [...ownerMetaRows, ...autoMetaRows],
      { src: esc(metaAdPages.length ? `${META_AD_SRC} ${META_AUTO_SRC}` : META_AUTO_SRC), note: label(`${metaAdPages.length ? `${META_AD_NOTE} ` : ''}${metaAutoNote(metaAdDate(metaAuto!.readDate))}`) });
  // Public search-ads library counts (S17) for the top brands' own websites. Empty values read "không có", never a bare zero; no advertiser detail exists to print.
  const searchAds = next ? options.searchAds : undefined;
  const searchAdsOk = searchAdsOkBrands(searchAds);
  const adsNum = (v: number | null): string => v === null || v === 0 ? 'không có' : String(v);
  const adsDay = (v: string | null): string => v === null ? 'không có' : v.split('-').reverse().join('/');
  const adsNotice = (brand: typeof searchAdsOk[number]): string => `<p><span data-quote>${label(brand.label)}</span>: ${label(searchAdsBrandNotice(brand))}</p>`;
  const searchAdsTable = !searchAds ? '' : searchAdsOk.length === 0
    ? `<p>${label(searchAdsNotice(searchAds))}</p>` + searchAds.brands.map(adsNotice).join('')
    : tbl('7.3', SEARCH_ADS_TABLE_TITLE, '', ['Thương hiệu', 'Trang web', 'Số mẫu quảng cáo', 'Chữ / Hình / Video', 'Hiện lần đầu – lần cuối', 'Số ngày hiện của mẫu dài ngày'],
      searchAdsOk.map(brand => {
        const no = registry.cite({ sourceKind: 'CAPTURE', identity: brand.responseSha256!, locator: null,
          label: SEARCH_ADS_SOURCE_LABEL, retrievedAt: brand.retrievedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
        const f = brand.formats!;
        return [`<span data-quote>${label(brand.label)}</span>`, label(brand.domain!), label(adsNum(brand.creativeCount)) + (no === null ? '' : renderCitationMark(no)),
          label(`${adsNum(f.text)} / ${adsNum(f.image)} / ${adsNum(f.video)}`), label(`${adsDay(brand.firstShown)} – ${adsDay(brand.lastShown)}`), label(adsNum(brand.maxDaysShown))];
      }), { src: esc(SEARCH_ADS_SOURCE_LABEL), note: esc(SEARCH_ADS_NOTE) }) +
      searchAds.brands.filter(brand => brand.status !== 'OK').map(adsNotice).join('');
  // TikTok top-ads page read by the app (S16 AUTO). Captions and labels are page text, so they stay quotations with a capture mark;
  // likes stay the page's own words. No spend, reach or rate is ever shown, and nothing is combined with sample numbers.
  const tiktok = next ? options.tiktokTopAds : undefined;
  const tiktokQuote = (text: string | null): string => text === null ? esc(TIKTOK_TOP_ADS_MISSING) : `<span data-quote>${label(text)}</span>`;
  const tiktokRows = !tiktok ? [] : tiktok.rows.length === 0
    ? [[label(tiktok.notice ?? ''), esc(TIKTOK_TOP_ADS_MISSING), esc(TIKTOK_TOP_ADS_MISSING), esc(TIKTOK_TOP_ADS_MISSING), esc(TIKTOK_TOP_ADS_MISSING)]]
    : tiktok.rows.map(row => {
      const no = registry.cite({ sourceKind: 'CAPTURE', identity: row.textSha256, locator: null, label: TIKTOK_TOP_ADS_CITATION_LABEL, retrievedAt: row.readAt,
        url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
      return [tiktokQuote(row.caption) + (no === null ? '' : renderCitationMark(no)), tiktokQuote(row.account), tiktokQuote(row.industry), tiktokQuote(row.objective),
        row.likes === null ? esc(TIKTOK_TOP_ADS_MISSING) : label(`${row.likes} lượt thích`)];
    });
  const tiktokTable = !tiktok ? '' : tbl('7.4', TIKTOK_TOP_ADS_TABLE_TITLE, '', [...TIKTOK_TOP_ADS_HEADERS], tiktokRows,
    { src: esc(TIKTOK_TOP_ADS_SRC), note: label(tiktok.readDate === null ? 'Lượt này chưa có bản đọc trang quảng cáo nổi bật của TikTok để kiểm tra.' : tiktokTopAdsNote(metaAdDate(tiktok.readDate))) })
    + (tiktok.moreCards > 0 ? `<p>${label(`Còn ${tiktok.moreCards} quảng cáo khớp nghĩa khác trên trang, không liệt kê thêm.`)}</p>` : '')
    + (tiktok.droppedCards > 0 ? `<p>${label(`Có ${tiktok.droppedCards} quảng cáo không khớp nghĩa với từ khoá sản phẩm nên không đưa vào bảng.`)}</p>` : '');
  sections.push(section('M07', 'Đối thủ', 'Giữ số liệu của mỗi gian hàng trên từng sàn; phần thiếu không dùng để so sánh đầy đủ.', requiredFig('product-ranking', '7.1') + tbl('7.1', 'Gian hàng trong mẫu, theo thứ tự dòng nguồn', '', ['Sàn', 'Gian hàng', 'Dòng lõi', 'Doanh thu lõi', 'Đơn vị bán lõi'], shops) + peers + metaAdTable + searchAdsTable + tiktokTable, d.defaultMarketPeers === null ? 'Chưa có tập đối thủ đã đóng băng trong đầu vào bản này. Không suy danh tính chéo sàn từ tên hoặc tiêu đề.' : 'Tập mặc định giữ riêng theo sàn và nhóm; nguồn thiếu hoặc doanh thu bằng không được ghi rõ. Không suy danh tính chéo sàn từ tên hoặc tiêu đề.'));
  let unitPriceTables = '';
  if (next) {
    const mark = (ref: { sourceSha256: string; locator: string }): string => {
      const no = registry.cite({ sourceKind: 'CAPTURE', identity: ref.sourceSha256,
        locator: null, technical: { locator: ref.locator }, label: 'Quy cách và giá trong bản lưu nguồn',
        retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
      return no === null ? 'Chưa có nguồn' : renderCitationMark(no);
    };
    const prices = { LISTED: 'Giá niêm yết', PAYMENT: 'Giá thanh toán', CONDITIONAL_PROMO: 'Giá khuyến mãi có điều kiện' };
    const groups = new Map<string, typeof d.unitPrices>();
    const missing: typeof d.unitPrices = [];
    d.unitPrices.forEach((item, index) => {
      for (const [field, value] of [['price', item.observation.price.value], ['quantity', item.observation.quantity.value], ['standard', item.value]] as const) {
        const id = `unitPrice.${index}.${field}`;
        if (value === null) B.setMissing(id, field === 'quantity' ? 'grouped' : 'dong'); else B.set(id, value, field === 'quantity' ? 'grouped' : 'dong');
      }
      if (item.value === null) missing.push(item);
      else groups.set(item.comparisonKey, [...(groups.get(item.comparisonKey) ?? []), item]);
    });
    const cells = (item: typeof d.unitPrices[number]): string[] => {
      const index = d.unitPrices.indexOf(item), observation = item.observation;
      const title = input.rows.find(row => row.i === item.rowI)!.title;
      return [plat(observation.platform), `<span data-quote>${esc(title)}</span><br><small>${label(observation.listing)}</small>`, `<span data-quote>${esc(observation.variant)}</span>`, label(observation.category.label),
        n(B.f(`unitPrice.${index}.price`)), `${n(B.f(`unitPrice.${index}.quantity`))} ${label(observation.quantity.unit)}`,
        n(B.f(`unitPrice.${index}.standard`)), label(item.standard), prices[observation.price.kind],
        label(`${observation.period.start} – ${observation.period.end}`),
        item.missing ?? 'Có dữ liệu khai báo đã đối chiếu bản lưu',
        `${item.ownerDeclared ? 'Số lượng do chủ khai báo' : 'Số lượng từ quy cách trang bán đã lưu'}${item.sources.map(mark).join('')}`,
        observation.price.conditions.length ? `<span data-quote>${observation.price.conditions.map(esc).join('; ')}</span>` : 'Không ghi điều kiện khuyến mãi'];
    };
    const headings = ['Sàn', 'Sản phẩm / mã nguồn', 'Biến thể', 'Ngành hàng', 'Giá (đồng)', 'Số lượng', 'Giá theo đơn vị chuẩn', 'Đơn vị chuẩn / cơ sở', 'Loại giá', 'Kỳ quan sát', 'Trạng thái', 'Nguồn số lượng', 'Điều kiện giá'];
    let no = next ? 1 : 2;
    unitPriceTables = [...groups.values()].map(group => tbl(`8.${no++}`, 'Giá theo đơn vị chuẩn — sắp xếp tăng dần trong phạm vi tương thích', '', headings,
      [...group].sort((a, b) => a.value! - b.value! || a.rowI - b.rowI).map(cells),
      { src: 'Quy cách trang bán và khai báo số lượng được giữ nguyên trong bản lưu.', note: 'Giá hiển thị làm tròn đến đồng; sắp xếp theo giá trị chưa làm tròn. Số lượng hiển thị tối đa ba chữ số thập phân. Chỉ sắp xếp cùng sàn, ngành hàng, đơn vị/cơ sở, loại giá, điều kiện giá và kỳ. Hàng dùng lâu cùng nhóm quy cách; combo không tách thành món.' })).join('');
    if (missing.length) unitPriceTables += tbl(`8.${no++}`, 'Dòng chưa rõ — không đưa vào sắp xếp', '', headings, missing.map(cells), { src: 'Quy cách trang bán trong bản lưu nguồn.' });
    if (!d.unitPrices.length) unitPriceTables = '<p>Chưa có bản lưu quy cách và giá tương thích đã xác minh. Chưa tính giá theo đơn vị chuẩn; không đoán số lượng từ tiêu đề.</p>';
    const observed = new Set(d.unitPrices.map(item => item.rowI));
    const absent = rows.filter(row => !observed.has(row.i));
    if (absent.length && d.unitPrices.length) unitPriceTables += tbl(`8.${no}`, 'Sản phẩm chưa có quy cách/giá đã xác minh — không đưa vào sắp xếp', '', ['Sàn', 'Tiêu đề nguồn', 'Trạng thái'], absent.map(row => [plat(row.platform), `<span data-quote>${esc(row.title)}</span>`, 'Chưa rõ số lượng và giá niêm yết' + cite(row.i)]));
    unitPriceTables += '<p>Kỳ quan sát giá ghi ở từng dòng và giữ riêng với kỳ doanh số. Khối lượng tịnh và khối lượng cái giữ riêng; thể tích tính theo đơn vị chuẩn, hàng đếm giữ cùng loại đơn vị. Quy đổi chỉ từ quy cách có vị trí nguồn hoặc khai báo của chủ. Đây là đối chiếu khai báo với bản lưu nguồn, không xác thực người bán. Không suy chất lượng, biên lợi nhuận hay mức giá nên bán.</p><p>Chưa có trường ROAS hoặc CPA với nguồn đã xác nhận trong đầu vào đã lưu; chưa có số liệu quảng cáo (ước tính) để tham khảo. Không suy từ doanh thu hoặc chi tiêu quảng cáo.</p><p>Dữ liệu được thu từ kênh công khai và xử lý bằng mô hình; doanh thu và chi tiêu quảng cáo có thể khác số thực tế.</p>';
  }
  sections.push(section('M08', 'Giá và kinh tế đơn vị', next ? 'Giá niêm yết, thanh toán, khuyến mãi có điều kiện và giá theo đơn vị chuẩn chỉ lấy từ quy cách đã lưu.' : 'Giá trung bình chỉ có khi doanh thu và đơn vị bán cùng dòng đều có số, mẫu số khác không.', next ? unitPriceTables : salesTable('8.1') + unitPriceTables, next ? 'Giữ riêng các giá từ quy cách với doanh thu trong mẫu. Chưa tính lãi vì không có giá vốn.' : 'Không có giá vốn hoặc phép quy đổi đã xác minh; chưa tính lãi hay giá theo đơn vị chuẩn.'));
  // Verified document excerpts (S25) sit in the context section, as copied text with a fixed note; the same list marks the source as used.
  const pdfExcerpts = next ? options.pdfExcerpts ?? [] : [];
  const pdfExcerptHtml = pdfExcerptBlockHtml(pdfExcerpts, esc, excerpt => { const no = registry.cite(pdfExcerptCitation(excerpt)); return no === null ? '' : renderCitationMark(no); }) + (pdfExcerpts.length ? `<p class="ex-src">Nguồn: ${esc(PDF_EXCERPT_SRC)}</p>` : '');
  const sellerVideos = next ? options.sellerVideos : undefined;
  const sellerVideoHtml = sellerVideos ? sellerVideoBlockHtml(sellerVideos, esc) + `<p class="ex-src">Nguồn: ${esc(sellerVideoSrc(sellerVideos))}</p>` : '';
  sections.push(section('M09', 'Động lực và rủi ro', 'Chưa đủ bằng chứng để kết luận nguyên nhân.', tbl('9.1', 'Ngày mở bán do nguồn ghi, giữ riêng từng dòng', '', ['Sàn', 'Tiêu đề nguồn', 'Ngày mở bán'], rows.map(row => [plat(row.platform), `<span data-quote>${esc(row.title)}</span>`, row.start === null || row.start === undefined ? 'Chưa rõ ngày' : label(row.start)])) + pdfExcerptHtml + sellerVideoHtml, [pdfExcerpts.length ? esc(PDF_EXCERPT_NOTE) : '', sellerVideos ? esc(sellerVideoNote(sellerVideos)) : ''].filter(Boolean).join(' ') || undefined));
  sections.push(section('M10', 'Dự báo và kịch bản', 'Chưa dự báo.', '<p>Cần chuỗi phù hợp và giả định đã kiểm chứng trước khi lập kịch bản.</p>'));
  const proposals = currentProposals({ PLATS, coreSegs: profile.core, segName, bf, tbl, SRC: sourceText });
  sections.push(...(next ? proposals.map((html, index) => index === 1
    ? html.replace(/Rà phạm vi dữ liệu đã lưu/iu, 'Việc làm nhanh: rà phạm vi dữ liệu đã lưu')
      .replace(/(?:Trước khi dùng báo cáo cho quyết định|Sau khi rà phạm vi, trước kết luận|Sau khi xác định đúng nhóm sản phẩm)/giu, 'Hạn: chủ chọn')
    : html) : proposals));
  const appendix = rows.map(row => {
    const value = (field: 'rev' | 'units' | 'asp'): string => {
      const id = `row.${row.i}.${field}`;
      if (row[field] === null) B.setMissing(id, 'num'); else B.set(id, row[field]!, 'num');
      return n(B.f(id)) + cite(row.i);
    };
    return [plat(row.platform), label(row.shopName || row.shop), label(row.brand) + ' (theo tiêu đề người bán)', value('rev'), value('units'), value('asp'), `<span data-quote>${esc(row.title)}</span>`];
  });
  const web = readerWebResults(options.webResults ?? [], true);
  const sourceRows = next ? [['Nguồn', sourceText], ['Kỳ', period],
    ['Dữ liệu đánh giá sản phẩm trên nền tảng', 'Chưa có trong lượt này'],
    ['Kết quả tìm kiếm', d.webFacts === null && web.length === 0 ? 'Chưa có trong lượt này' : 'Đã lưu trong lượt này'],
    ['Bình luận đã thu thập', 'Chưa có trong lượt này'],
    ...(interestChart ? [[SEARCH_INTEREST_SOURCE_LABEL, 'Đã lưu trong lượt này; chỉ số tương đối, không phải doanh số']] : []),
    ...(worldBankTable ? [[WORLD_BANK_SOURCE_LABEL, 'Đã lưu trong lượt này; số liệu cả nước, chỉ là bối cảnh']] : []),
    ...(comtradeRows.length ? [[COMTRADE_SOURCE_LABEL, 'Đã lưu trong lượt này; số liệu cả nước, chỉ là bối cảnh']] : []),
    ...(metaAdPages.length ? [[META_AD_SOURCE_LABEL, META_AD_SOURCE_NOTE]] : []),
    ...(autoMetaRows.length ? [[META_AUTO_SOURCE_LABEL, META_AUTO_SOURCE_NOTE]] : []),
    ...(searchAdsOk.length ? [[SEARCH_ADS_SOURCE_LABEL, SEARCH_ADS_SOURCE_NOTE]] : []),
    ...(tiktok ? [[TIKTOK_TOP_ADS_SOURCE_LABEL, tiktok.notice ?? TIKTOK_TOP_ADS_SOURCE_NOTE]] : []),
    ...(officialRows.length ? [[E12_ATTRIBUTION, 'Đã lưu trong lượt này; số liệu thống kê cả nước theo nhóm hàng, chỉ là bối cảnh']] : [])] : [['Nguồn', sourceText], ['Kỳ', period]];
  if (d.webFacts !== null) {
    const facts = d.webFacts;
    const no = registry.cite({ sourceKind: 'CAPTURE', identity: input.webSnapshotSha256!, locator: { kind: 'source-locator', value: 'số liệu tổng quan' }, label: 'Trang kết quả tìm kiếm: số liệu tổng quan', retrievedAt: facts.capturedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    const mark = no === null ? '' : renderCitationMark(no);
    sourceRows.push(['Trang nguồn', 'toàn kết quả tìm kiếm' + mark]);
    for (const [name, fact] of [['Doanh thu', facts.kpi.revenue], ['Đơn vị bán', facts.kpi.units], ['Sản phẩm có lượt bán', facts.kpi.soldListings], ['Gian hàng có lượt bán', facts.kpi.shops]] as const) {
      sourceRows.push([name + ' trên trang (toàn kết quả tìm kiếm)', fact.current.value === null ? 'Chưa có dữ liệu' : label(fact.current.value.toLocaleString('vi-VN')) + mark]);
    }
    for (const item of facts.platformSplit) {
      if (item.platform === 'unknown') continue;
      sourceRows.push([`Doanh thu ${PLATFORM_LABEL[item.platform]} trên trang (toàn kết quả tìm kiếm)`, item.revenue.value === null ? 'Chưa có dữ liệu' : label(item.revenue.value.toLocaleString('vi-VN')) + mark]);
    }
  }
  let retainedSourceTables = '';
  if (d.webFacts !== null) {
    const facts = d.webFacts;
    const sourceCell = (cell: MetricWebCellFact | undefined): string => {
      if (cell === undefined) return 'Chưa có dữ liệu';
      const no = registry.cite({ sourceKind: 'CAPTURE', identity: input.webSnapshotSha256!,
        locator: { kind: 'source-locator', value: cell.sourcePointer }, label: 'Bảng trên trang nguồn đã lưu',
        retrievedAt: facts.capturedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
      const literal = 'text' in cell ? cell.text : cell.displayed;
      const missing = 'value' in cell && cell.value === null ? 'Chưa có dữ liệu · lời nguồn: ' : '';
      return missing + `<span data-quote>${esc(literal)}</span>` + (no === null ? '' : renderCitationMark(no));
    };
    for (const [title, shares] of [['Nhãn thương hiệu', facts.top10Share.brand], ['Gian hàng', facts.top10Share.shop]] as const) {
      if ('absent' in shares) continue;
      sourceRows.push([`${title}: nhóm mười theo trang (toàn kết quả tìm kiếm)`, sourceCell(shares.top10)]);
      sourceRows.push([`${title}: phần còn lại theo trang (toàn kết quả tìm kiếm)`, sourceCell(shares.others)]);
    }
    if (!('absent' in facts.shopType)) for (const item of facts.shopType) {
      sourceRows.push([`${item.shopType === 'mall' ? 'Gian hàng có nhãn Mall' : 'Gian hàng thường'} theo trang (toàn kết quả tìm kiếm)`, sourceCell(item.share)]);
    }
    const groups: [string, MetricWebTableFact][] = [
      ['Ngành hàng', facts.category], ['Mức giá', facts.priceLevel], ['Thương hiệu theo loại gian hàng', facts.brandByShopType],
      ['Khu vực', facts.location], ['Sản phẩm trên trang', facts.topProducts], ['Gian hàng trên trang', facts.topShops],
      ['Nhãn thương hiệu trên trang', facts.topBrands], ['Lịch sử chi tiết', facts.detailHistory],
    ];
    let sourceTableNumber = next ? (web.length === 0 ? 4 : 5) : (web.length === 0 ? 3 : 4);
    retainedSourceTables = groups.map(([title, group]) => {
      if ('absent' in group || group.length === 0) return '';
      const columns = [...new Set(group.flatMap(row => Object.keys(row)))];
      return tbl(`PL.${sourceTableNumber++}`, title + ' (toàn kết quả tìm kiếm)', '',
        columns.map(key => esc(group.find(row => row[key] !== undefined)![key]!.label)),
        group.map(row => columns.map(key => sourceCell(row[key]))),
        { src: 'Trang nguồn đã lưu; lời và thứ tự nguồn được giữ nguyên.', note: 'Phạm vi trên trang khác mẫu sản phẩm. Hạng do nguồn ghi không phải kết luận hay ưu tiên của báo cáo; tên không chứng minh danh tính chéo sàn.' });
    }).join('');
  }
  const glossaryTable = next ? tbl('PL.3', 'Thuật ngữ', '', ['Thuật ngữ', 'Nghĩa tiếng Việt'], [
    ['listing', 'sản phẩm'], ['review', 'đánh giá'], ['export', 'tệp dữ liệu'], ['peer set', 'nhóm đối thủ'],
    ['Giá TB', 'giá trung bình'], ['P25 / P75', 'mốc 25% / mốc 75%'], ['NSX', 'nhà sản xuất'], ['H1', 'giả thuyết 1'],
    ['ROAS', 'tỷ lệ doanh thu trên chi phí quảng cáo'], ['CPA', 'chi phí trên đơn'], ['AI', 'trí tuệ nhân tạo'],
  ], { cls: 'pl-terms-table' }) : '';
  const typed = next && options.webPageTypes === true;
  // The page type reads the stored title and snippet, not the withheld wording shown in their place.
  const stored = new Map((options.webResults ?? []).map(v => [`${v.position}|${v.url}`, v]));
  const pageType = (w: ReaderWebResult): string => WEB_PAGE_TYPE_LABEL[classifyWebPage(stored.get(`${w.position}|${w.url}`) ?? w)];
  const originated = next && web.some(w => w.origin !== undefined);
  const webTable = web.length === 0 ? '' : tbl(next ? 'PL.4' : 'PL.3', 'Kết quả tìm kiếm trên web', '', ['Trang tìm thấy', ...(originated ? [EXPANDED_SEARCH_COLUMN] : []), ...(typed ? ['Loại trang'] : []), 'Đoạn mô tả hiển thị'], web.map(w => {
    const no = registry.cite({ sourceKind: 'WEB_RESULT', identity: w.url, locator: null, label: w.site || 'Kết quả tìm kiếm trên web', retrievedAt: w.retrievedAt, url: w.url, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    const mark = no === null ? '' : renderCitationMark(no), meta = [w.site, w.published ? `đăng ${w.published}` : null].filter(Boolean).join(' · ');
    return [`<span data-quote><a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.title)}</a>${mark}${meta ? `<span class="pl-meta">${esc(meta)}</span>` : ''}</span>`, ...(originated ? [w.origin ? EXPANDED_SEARCH_LABEL[w.origin] : ''] : []), ...(typed ? [pageType(w)] : []), `<span data-quote>${esc(w.snippet ?? '')}</span>`];
  }), { src: 'Kết quả tìm kiếm đã lưu.', note: 'Tiêu đề và đoạn mô tả chép theo kết quả tìm kiếm, chưa mở trang gốc để đối chiếu; không phải nhận định của báo cáo.' + (originated ? ' ' + EXPANDED_SEARCH_NOTE : '') });
  sections.push(section('M13', 'Nguồn, thuật ngữ và danh sách sản phẩm', nar('Giữ đủ {{src.rows}} dòng nguồn để tra lại.', 'M13'),
    tbl('PL.1', 'Dòng dữ liệu đã lưu, theo từng sàn', '', ['Sàn', 'Gian hàng', 'Nhãn thương hiệu', 'Doanh thu', 'Đơn vị bán', 'Giá trung bình', 'Tiêu đề nguồn'], appendix) + tbl('PL.2', 'Nguồn số liệu đã lưu', '', ['Hạng mục', 'Nguồn / giá trị'], sourceRows) + (next ? glossaryTable : '') + webTable + retainedSourceTables + renderCitationRegister(registry.entries(), { format: 'web' })));
  const html = page({ title: `Báo cáo thị trường – ${profile.product}`, coverHtml: cover(options.cover ?? null, `Dữ liệu ${period}`, ['Báo cáo thị trường', profile.product, 'Bản đọc cho chủ dự án']),
    intro: `<div class="box"><p>Số ước tính trong mẫu. Mỗi sàn tính riêng. Phân loại ${status}.</p></div>`, toc: MARKET_TOC, sections, foot: `TDN · ${esc(options.builtOn)}` });
  const renderedHtml = next ? html.replace('<body', '<body data-report-rules="market-visible-v1"') : html;
  const finalHtml = next ? renderedHtml.replace(/Ghi chú:/gu, 'Chú thích:') : html;
  const scopedHtml = finalHtml.replace('<body', `<body data-market-platforms="${PLATS.join(',')}"${flintMarks ? ` data-market-chart-rows="${chartRows.length}"` : ''}`);
  return { html: next ? platIcons(scopedHtml, PLATFORM_COLORS, undefined, { compoundPlatformLabels: true }).html : html, narrator, extraOk: [...extraOk], charts, webResults: web, ...(next ? { visibleTextRules: true } : {}) };
}
