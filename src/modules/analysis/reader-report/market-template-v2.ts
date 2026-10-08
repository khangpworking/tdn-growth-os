import type { ReaderReportData } from './build.js';
import { completeSum } from './nullable-metrics.js';
import { readerPeerExhibit } from './default-peers.js';
import { lineChart } from './svg-charts.js';
import { Narrator } from './bundle.js';
import { esc } from './format.js';
import { cover, makeExhibits, n, page, plat, PLATFORM_LABEL, section } from './layout.js';
import { currentProposals } from './market-proposals.js';
import { MARKET_TOC, readerWebResults, type BuiltMarketReport, type MarketReportOptions } from './market-template.js';
import { CitationRegistry } from '../citation-registry.js';
import { renderCitationMark, renderCitationRegister } from '../citation-register-html.js';
import type { MetricWebCellFact, MetricWebTableFact } from '../research-automation/metric-web-facts.js';

/** Missing-input projection. No chart fabricates a zero bar for an unobserved value. */
export async function buildMarketReportV2(d: ReaderReportData, options: MarketReportOptions): Promise<BuiltMarketReport> {
  const { input, profile, rows, bundle: B } = d, PLATS = input.platforms;
  const narrator = new Narrator(B), registry = new CitationRegistry(), extraOk = new Set<string>();
  const label = (s: string): string => { if (/\d/.test(s)) extraOk.add(s); return esc(s); };
  const source = input.source!;
  const period = `${source.measurementPeriod.start.split('-').reverse().join('/')} – ${source.measurementPeriod.end.split('-').reverse().join('/')}`;
  const sourceText = `Dữ liệu bán hàng ước tính trên từng sàn, ${period}; trong mẫu sản phẩm đã lưu.`;
  const { tbl, fig } = makeExhibits(sourceText);
  const cite = (i?: number): string => {
    if (input.rowLineage === undefined) return '<span class="no-source">Chưa có nguồn</span>';
    const no = registry.cite({ sourceKind: 'METRIC_ROW', identity: input.rowLineage.sha256,
      locator: i === undefined ? null : { kind: 'xlsx', sheet: 'Sheet1', cell: `A${i + 2}:T${i + 2}` },
      label: i === undefined ? 'Số liệu đã tính từ nguồn đã lưu' : 'Dòng số liệu nguồn', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return no === null ? '<span class="no-source">Chưa có nguồn</span>' : renderCitationMark(no);
  };
  const bf = (id: string): string => B.f(id) + cite();
  const nar = (template: string, where: string): string => narrator.nar(template, where) + cite();
  const segName = (k: string): string => profile.segments[k] ?? k;
  const status = profile.status === 'approved' ? 'đã được chủ duyệt' : 'đề xuất, chờ chủ duyệt';
  const sections: string[] = [], charts: BuiltMarketReport['charts'] = [];
  const summary = PLATS.map(P => nar(`${PLATFORM_LABEL[P]}: {{${P}.core.rev}} doanh thu, {{${P}.core.units}} đơn vị bán trong mẫu`, `M01.${P}`)).join('; ');
  sections.push(section('M01', 'Kết luận chính', summary,
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
  const salesTable = (no: string) => tbl(no, 'Doanh số trong mẫu, từng sàn', '', ['Sàn', 'Doanh thu ước tính', 'Đơn vị bán ước tính', 'Giá trung bình'],
    PLATS.map(P => [plat(P), n(bf(`${P}.core.rev`)), n(bf(`${P}.core.units`)), n(bf(`${P}.core.asp`))]));
  let monthly = '';
  if (d.webFacts !== null && !('absent' in d.webFacts.monthly)) {
    const facts = d.webFacts, groups = d.webFacts.monthly;
    const months = [...new Set(Object.values(groups).flatMap(group => Object.keys(group ?? {})))].sort();
    const no = registry.cite({ sourceKind: 'CAPTURE', identity: input.webSnapshotSha256!, locator: { kind: 'source-locator', value: 'số liệu theo tháng' }, label: 'Trang kết quả tìm kiếm: số liệu theo tháng', retrievedAt: facts.capturedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    const mark = no === null ? '' : renderCitationMark(no);
    if (months.length) monthly = fig('3.1', 'Doanh thu theo tháng, từng sàn (toàn kết quả tìm kiếm)', 'tỷ đồng', lineChart(months, PLATS.map(P => ({ name: PLATFORM_LABEL[P]!, color: P === 'shopee' ? '#c2410c' : '#1d2327', values: months.map(month => { const value = groups[P]?.[month]?.revenue.value; return value === null || value === undefined ? null : value / 1e9; }) }))), { src: 'Trang kết quả tìm kiếm đã lưu (toàn kết quả tìm kiếm)' + mark, note: 'Tháng thiếu có khoảng trống; mỗi sàn giữ riêng.' }) + tbl('3.2', 'Doanh thu theo tháng (toàn kết quả tìm kiếm)', '', ['Sàn', 'Tháng', 'Doanh thu'], PLATS.flatMap(P => months.map(month => {
      const id = `web.${P}.m.${month}`;
      return [plat(P), label(month), (B.has(id) ? n(B.f(id)) : 'Chưa có dữ liệu') + mark];
    })), { src: 'Trang kết quả tìm kiếm đã lưu (toàn kết quả tìm kiếm)' + mark });
    if (months.length) charts.push({ id: 'M03.monthly', engine: 'svg-fallback' });
  }
  sections.push(section('M03', 'Quy mô và diễn biến', monthly ? 'Doanh số trong mẫu và chuỗi trên trang nguồn giữ riêng; có số theo tháng cho từng sàn ở Hình 3.1.' : 'Chỉ mô tả doanh số trong mẫu; chưa có chuỗi phù hợp để xác định diễn biến.', salesTable('3.1') + monthly, 'Một thành viên thiếu làm tổng chưa xác định; mẫu số bằng không không tạo ra giá trung bình.'));
  sections.push(section('M04', 'Cơ cấu thị trường', 'Các nhóm đặt cạnh nhau theo quy tắc phân loại, tính riêng từng sàn.',
    tbl('4.1', 'Cơ cấu doanh số trong mẫu theo nhóm', '', ['Sàn', 'Nhóm', 'Doanh thu', 'Đơn vị bán', 'Tỷ trọng doanh thu lõi'], PLATS.flatMap(P => profile.core.map(k => [plat(P), label(segName(k)), n(bf(`${P}.seg.${k}.rev`)), n(bf(`${P}.seg.${k}.units`)), n(bf(`${P}.seg.${k}.revShare`))]))), 'Tỷ trọng trong mẫu; không phải thị phần.'));
  sections.push(section('M05', 'Nhu cầu (tín hiệu bán)', 'Nhu cầu, đo bằng doanh số (ước tính) trong mẫu.', salesTable('5.1') +
    `<p>Kỳ ${period}; nguồn: dữ liệu bán hàng ước tính trên từng sàn. Mức quan tâm tìm kiếm ghi riêng, chưa có chuỗi tìm kiếm phù hợp trong bản này.</p>`,
    'Số bán hàng ước tính chưa đối chiếu với người bán, chỉ dùng tham khảo. Không suy ra quy mô ngoài mẫu, số người mua, nhu cầu chưa được đáp ứng hay dự báo.'));
  sections.push(section('M06', 'Nguồn cung', 'Giữ riêng nhãn thương hiệu theo tiêu đề người bán trên từng sàn.',
    tbl('6.1', 'Ngày mở bán và phần chưa rõ', '', ['Sàn', 'Có ngày', 'Thiếu ngày', 'Mở bán trong kỳ', 'Doanh thu mở bán trong kỳ'],
      PLATS.map(P => [plat(P), n(bf(`${P}.coh.known`)), n(bf(`${P}.coh.nodate`)), n(bf(`${P}.coh.n`)), n(bf(`${P}.coh.rev`))])) +
    `<p>Tên giống nhau không chứng minh cùng thương hiệu, người bán hay người mua giữa các sàn. Nhãn trên dòng nguồn nằm ở Phụ lục.</p>`));
  const shops = PLATS.flatMap(P => [...new Set(rows.filter(row => row.platform === P).map(row => row.shop))].map((shop, i) => {
    const members = rows.filter(row => row.platform === P && row.shop === shop && profile.core.includes(row.seg!));
    const rev = completeSum(members, 'rev'), units = completeSum(members, 'units'), id = `shop.${P}.${i}`;
    B.set(`${id}.n`, members.length, 'num');
    if (rev === null) B.setMissing(`${id}.rev`, 'ty'); else B.set(`${id}.rev`, rev, 'ty');
    if (units === null) B.setMissing(`${id}.units`, 'num'); else B.set(`${id}.units`, units, 'num');
    return [plat(P), label(members[0]?.shopName || shop), n(bf(`${id}.n`)), n(bf(`${id}.rev`)), n(bf(`${id}.units`))];
  }));
  const peers = readerPeerExhibit(d.defaultMarketPeers, B, { text: label, metric: bf, sourceMark: ref => {
    const no = registry.cite({ sourceKind: 'METRIC_ROW', identity: ref.sourceSha256,
      locator: { kind: 'source-locator', value: ref.locator }, label: 'Dòng doanh số nguồn đã lưu',
      retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return no === null ? '<span class="no-source">Chưa có nguồn</span>' : renderCitationMark(no);
  } });
  sections.push(section('M07', 'Đối thủ', 'Giữ số liệu của mỗi gian hàng trên từng sàn; phần thiếu không dùng để so sánh đầy đủ.', tbl('7.1', 'Gian hàng trong mẫu, theo thứ tự dòng nguồn', '', ['Sàn', 'Gian hàng', 'Dòng lõi', 'Doanh thu lõi', 'Đơn vị bán lõi'], shops) + peers, d.defaultMarketPeers === null ? 'Chưa có tập đối thủ đã đóng băng trong đầu vào bản này. Không suy danh tính chéo sàn từ tên hoặc tiêu đề.' : 'Tập mặc định giữ riêng theo sàn và nhóm; nguồn thiếu hoặc doanh thu bằng không được ghi rõ. Không suy danh tính chéo sàn từ tên hoặc tiêu đề.'));
  sections.push(section('M08', 'Giá và kinh tế đơn vị', 'Giá trung bình chỉ có khi doanh thu và đơn vị bán cùng dòng đều có số, mẫu số khác không.', salesTable('8.1'), 'Không có giá vốn hoặc phép quy đổi đã xác minh; chưa tính lãi hay giá theo đơn vị chuẩn.'));
  sections.push(section('M09', 'Động lực và rủi ro', 'Chưa đủ bằng chứng để kết luận nguyên nhân.', tbl('9.1', 'Ngày mở bán do nguồn ghi, giữ riêng từng dòng', '', ['Sàn', 'Tiêu đề nguồn', 'Ngày mở bán'], rows.map(row => [plat(row.platform), `<span data-quote>${esc(row.title)}</span>`, row.start === null || row.start === undefined ? 'Chưa rõ ngày' : label(row.start)]))));
  sections.push(section('M10', 'Dự báo và kịch bản', 'Chưa dự báo.', '<p>Cần chuỗi phù hợp và giả định đã kiểm chứng trước khi lập kịch bản.</p>'));
  sections.push(...currentProposals({ PLATS, coreSegs: profile.core, segName, bf, tbl, SRC: sourceText }));
  const appendix = rows.map(row => {
    const value = (field: 'rev' | 'units' | 'asp'): string => {
      const id = `row.${row.i}.${field}`;
      if (row[field] === null) B.setMissing(id, 'num'); else B.set(id, row[field]!, 'num');
      return n(B.f(id)) + cite(row.i);
    };
    return [plat(row.platform), label(row.shopName || row.shop), label(row.brand) + ' (theo tiêu đề người bán)', value('rev'), value('units'), value('asp'), `<span data-quote>${esc(row.title)}</span>`];
  });
  const web = readerWebResults(options.webResults ?? [], true);
  const sourceRows = [['Nguồn', sourceText], ['Kỳ', period]];
  if (d.webFacts !== null) {
    const facts = d.webFacts;
    const no = registry.cite({ sourceKind: 'CAPTURE', identity: input.webSnapshotSha256!, locator: { kind: 'source-locator', value: 'số liệu tổng quan' }, label: 'Trang kết quả tìm kiếm: số liệu tổng quan', retrievedAt: facts.capturedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    const mark = no === null ? '' : renderCitationMark(no);
    sourceRows.push(['Trang nguồn', 'toàn kết quả tìm kiếm' + mark]);
    for (const [name, fact] of [['Doanh thu', facts.kpi.revenue], ['Đơn vị bán', facts.kpi.units], ['Sản phẩm có lượt bán', facts.kpi.soldListings], ['Gian hàng có lượt bán', facts.kpi.shops]] as const) {
      sourceRows.push([name + ' trên trang (toàn kết quả tìm kiếm)', fact.current.value === null ? 'Chưa có dữ liệu' : label(fact.current.value.toLocaleString('vi-VN')) + mark]);
    }
    for (const item of facts.platformSplit) sourceRows.push([`Doanh thu ${PLATFORM_LABEL[item.platform]} trên trang (toàn kết quả tìm kiếm)`, item.revenue.value === null ? 'Chưa có dữ liệu' : label(item.revenue.value.toLocaleString('vi-VN')) + mark]);
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
    let sourceTableNumber = web.length === 0 ? 3 : 4;
    retainedSourceTables = groups.map(([title, group]) => {
      if ('absent' in group || group.length === 0) return '';
      const columns = [...new Set(group.flatMap(row => Object.keys(row)))];
      return tbl(`PL.${sourceTableNumber++}`, title + ' (toàn kết quả tìm kiếm)', '',
        columns.map(key => esc(group.find(row => row[key] !== undefined)![key]!.label)),
        group.map(row => columns.map(key => sourceCell(row[key]))),
        { src: 'Trang nguồn đã lưu; lời và thứ tự nguồn được giữ nguyên.', note: 'Phạm vi trên trang khác mẫu sản phẩm. Hạng do nguồn ghi không phải kết luận hay ưu tiên của báo cáo; tên không chứng minh danh tính chéo sàn.' });
    }).join('');
  }
  const webTable = web.length === 0 ? '' : tbl('PL.3', 'Kết quả tìm kiếm trên web', '', ['Trang tìm thấy', 'Đoạn mô tả Google hiển thị'], web.map(w => {
    const no = registry.cite({ sourceKind: 'WEB_RESULT', identity: w.url, locator: null, label: w.site || 'Kết quả tìm kiếm trên web', retrievedAt: w.retrievedAt, url: w.url, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    const mark = no === null ? '' : renderCitationMark(no), meta = [w.site, w.published ? `đăng ${w.published}` : null].filter(Boolean).join(' · ');
    return [`<span data-quote><a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.title)}</a>${mark}${meta ? `<span class="pl-meta">${esc(meta)}</span>` : ''}</span>`, `<span data-quote>${esc(w.snippet ?? '')}</span>`];
  }), { src: 'Google; kết quả tìm kiếm đã lưu.', note: 'Tiêu đề và đoạn mô tả chép theo kết quả tìm kiếm Google, chưa mở trang gốc để đối chiếu; không phải nhận định của báo cáo.' });
  sections.push(section('M13', 'Nguồn, thuật ngữ và danh sách sản phẩm', nar('Giữ đủ {{src.rows}} dòng nguồn để tra lại.', 'M13'),
    tbl('PL.1', 'Dòng dữ liệu đã lưu, theo từng sàn', '', ['Sàn', 'Gian hàng', 'Nhãn thương hiệu', 'Doanh thu', 'Đơn vị bán', 'Giá trung bình', 'Tiêu đề nguồn'], appendix) + tbl('PL.2', 'Nguồn số liệu đã lưu', '', ['Hạng mục', 'Nguồn / giá trị'], sourceRows) + webTable + retainedSourceTables + renderCitationRegister(registry.entries(), { format: 'web' })));
  const html = page({ title: `Báo cáo thị trường – ${profile.product}`, coverHtml: cover(options.cover ?? null, `Dữ liệu ${period}`, ['Báo cáo thị trường', profile.product, 'Bản đọc cho chủ dự án']),
    intro: `<div class="box"><p>Số ước tính trong mẫu. Mỗi sàn tính riêng. Phân loại ${status}.</p></div>`, toc: MARKET_TOC, sections, foot: `TDN · ${esc(options.builtOn)}` });
  return { html, narrator, extraOk: [...extraOk], charts, webResults: web };
}
