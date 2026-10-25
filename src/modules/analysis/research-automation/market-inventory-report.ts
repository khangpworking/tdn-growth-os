import type { AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import { escapeHtml as escape, readerPointer, sourceMemberLabel, storedLiteral, type ReportCitations } from './descriptive-report.js';
import { formatReaderCount, formatReaderValue, readerMeasureName, readerProductLabel, readerQuoteLabel, readerValueKind } from './reader-plain-text.js';
import { containsForbiddenProviderName } from '../citation-registry.js';
import { inclusiveDayCount, parseProviderProductRef } from './provider-common.js';
import type { CaptureRecord, ScopeSnapshot } from './model.js';
import { traceMarketNumber, type MarketTraceInput } from './market-trace-map.js';
import { storedInput } from './market-trace-inputs.js';

type Observation = AutomationMarketMethodSnapshot['temporal']['input']['observations'][number];
type Quote = AutomationMarketMethodSnapshot['quotes']['input']['quotes'][number];
type Trace = (ref: { sourceSha256: string; fieldPointer: string }) => string;
type Window = { readonly start: string | null; readonly end: string | null };
/** Supplied only for the market14 presentation; retained readers keep their original rendering. */
export type MarketInventoryReaderContext = {
  readonly platforms: ReadonlyMap<string, string>;
  readonly scope?: Pick<ScopeSnapshot, 'selectedProductIds' | 'peerProductIds'>;
  readonly sampleWindow?: Window | null;
  readonly captures?: readonly CaptureRecord[];
  /** Raw-number reports print no average price (revenue ÷ units, or the source's own average); only listed price ranges stay. */
  readonly withoutAveragePrice?: boolean;
};

export function marketInventorySection(snapshot: AutomationMarketMethodSnapshot, section: 'M03' | 'M08', citations: ReportCitations, productLabels?: ReadonlyMap<string, string>, readerPlainText = false, reader?: MarketInventoryReaderContext): string {
  const trace: Trace = ref => {
    const pointer = readerPointer(ref.fieldPointer, readerPlainText);
    return citations.mark({
      sourceKind: 'CAPTURE', identity: ref.sourceSha256.trim() === '' ? null : ref.sourceSha256, locator: pointer.locator,
      label: 'Số liệu nguồn đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { fieldPointer: ref.fieldPointer },
    });
  };
  if (readerPlainText) {
    if (section === 'M03') return readerPeriodSection(snapshot, trace, productLabels, reader);
    const retained = readerPriceSection(snapshot, trace, productLabels, reader?.withoutAveragePrice === true);
    if (!reader) return retained;
    const raw = snapshot.quotes.input.quotes.map(quote => `<tr><td>${escape(quote.quoteId)}</td><td>${escape(quote.price.value ?? (quote.price.range ? `${quote.price.range.minimum} đến ${quote.price.range.maximum}` : 'Không có giá đọc được'))}</td><td>${trace(quote.source)}</td></tr>`).join('');
    return latestReaderPrices(snapshot, trace, productLabels, reader) + `<details class="evidence-trace"><summary>Bản ghi giá theo từng lần thu</summary>${retained}<table><thead><tr><th>Bản ghi</th><th>Giá trị nguồn (VND)</th><th>Nguồn</th></tr></thead><tbody>${raw}</tbody></table></details>`;
  }
  if (section === 'M03') {
    const rows = snapshot.temporal.input.observations.map(row => `<tr><td>${row.subjectMemberKeys.map(key => escape(sourceMemberLabel(key, false))).join(', ')}</td><td>${escape(row.measure.literal)} / ${escape(row.measure.unit ?? row.measure.currency ?? 'Chưa rõ đơn vị')}</td><td>${escape(row.value.literal ?? 'Thiếu giá trị nguồn')}</td><td>${escape(row.requestedWindow.start ?? '?')} đến ${escape(row.requestedWindow.end ?? '?')}</td><td>${trace(row.source)}</td></tr>`).join('');
    return `<p class="warning">Đã giữ số liệu theo kỳ truy vấn cho các sản phẩm được chọn. Chưa xác minh đầy đủ định nghĩa phép đo, múi giờ, biên kỳ, tính cộng được và độ phủ. Không cộng thành tổng năm, tính tăng trưởng hay gọi đây là quy mô thị trường.</p><div class="table-wrap" role="region" aria-label="Quan sát theo kỳ" tabindex="0"><table><caption>Quan sát theo kỳ, chưa phải chuỗi thời gian đủ điều kiện tính</caption><thead><tr><th>Đối tượng nguồn</th><th>Phép đo nguồn</th><th>Giá trị nguồn</th><th>Kỳ truy vấn</th><th>Nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Không có số liệu theo kỳ dùng được.</td></tr>'}</tbody></table></div>`;
  }
  const rows = snapshot.quotes.input.quotes.map(quote => `<tr><td>${storedLiteral(quote.quoteId, 'Bản ghi được giữ trong bản lưu nguồn')}</td><td>${quote.price.value !== null ? escape(quote.price.value) : quote.price.range ? `${escape(quote.price.range.minimum)} đến ${escape(quote.price.range.maximum)}` : 'Không có giá đọc được'} ${escape(quote.price.currency ?? '')}</td><td>${escape(quote.price.state)}<br>Chưa xác nhận giá pack/variant hoặc điều kiện thanh toán</td><td>${trace(quote.source)}</td></tr>`).join('');
  return `<p class="warning">Giá do nguồn trả về chỉ là quan sát. Chưa biết variant, số lượng mỗi pack, khối lượng tịnh/ráo hay điều kiện giá. Không tính giá mỗi đơn vị, biên lợi nhuận hoặc so sánh như cùng loại hàng.</p><div class="table-wrap" role="region" aria-label="Giá quan sát và khoảng giá nguồn" tabindex="0"><table><caption>Giá quan sát và khoảng giá nguồn, chưa chuẩn hóa đơn vị</caption><thead><tr><th>Bản ghi nguồn</th><th>Giá / khoảng giá</th><th>Giới hạn</th><th>Nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Chưa có báo giá nguồn.</td></tr>'}</tbody></table></div>`;
}

/** Product numbering follows the frozen run scope, then any further key in first-seen order. */
function productNamer(snapshot: AutomationMarketMethodSnapshot, productLabels: ReadonlyMap<string, string> | undefined) {
  const ordinals = new Map<string, number>();
  for (const member of snapshot.temporal.input.frame?.members ?? []) if (!ordinals.has(member.memberKey)) ordinals.set(member.memberKey, ordinals.size + 1);
  const ordinal = (key: string): number => {
    if (!ordinals.has(key)) ordinals.set(key, ordinals.size + 1);
    return ordinals.get(key)!;
  };
  for (const observation of snapshot.temporal.input.observations) for (const key of observation.subjectMemberKeys ?? []) ordinal(key);
  return {
    ordinal: (keys: readonly string[]): number => keys.length ? Math.min(...keys.map(ordinal)) : Number.MAX_SAFE_INTEGER,
    label: (keys: readonly string[]): string => keys.map(key => readerProductLabel(sourceMemberLabel(key, true), productLabels?.get(key), ordinal(key))).join(', '),
    keys: (): readonly string[] => [...ordinals.keys()],
  };
}

function readerDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

function windowText(window: Window | null): string {
  const start = readerDate(window?.start), end = readerDate(window?.end);
  return start && end ? `${start} đến ${end}` : 'Kỳ đo được giữ trong bản lưu nguồn';
}

/** One platform resolver for both market14 inventory tables; unknown references stay unknown. */
function readerPlatform(snapshot: AutomationMarketMethodSnapshot, reader: MarketInventoryReaderContext, keys: readonly string[], quotes: readonly Quote[] = []): string {
  const label = (value: string | null | undefined): string | null => value === 'shopee' || value === 'SHOPEE' ? 'Shopee'
    : value === 'tiktok' || value === 'TIKTOK_SHOP' ? 'TikTok Shop' : null;
  const platforms = keys.map(key => label(reader.platforms.get(key))
    ?? label(snapshot.temporal.input.frame?.members.find(member => member.memberKey === key)?.platform)
    ?? (parseProviderProductRef(key) ? 'TikTok Shop' : null));
  if (!platforms.length) platforms.push(...quotes.map(quote => label(quote.identity?.platform)));
  return [...new Set(platforms.map(platform => platform ?? 'Chưa rõ sàn'))].join(', ') || 'Chưa rõ sàn';
}

function shortWindowDays(window: Window): number | null {
  if (!window.start || !window.end) return null;
  try {
    const days = inclusiveDayCount({ startDate: window.start, endDate: window.end });
    return days > 0 && days < 30 ? days : null;
  } catch { return null; }
}

function selectionText(reader: MarketInventoryReaderContext, keys: readonly string[]): string {
  const selected = new Set(reader.scope?.selectedProductIds ?? []), peers = new Set(reader.scope?.peerProductIds ?? []);
  const count = (scope: ReadonlySet<string>): number => keys.filter(key => scope.has(key)).length;
  const principalCount = count(selected), peerCount = count(peers);
  // Each role count is recorded against the run scope's product ids it counts.
  const counted = (value: number, field: 'selectedProductIds' | 'peerProductIds'): string => traceMarketNumber(formatReaderCount(value)!, 'M03.inventory.selection', 'computed',
    keys.filter(key => (field === 'selectedProductIds' ? selected : peers).has(key)).map(key => storedInput('run-record', 'scope', `/${field}/${(reader.scope?.[field] ?? []).indexOf(key)}`, key)), 'count(scope products in the table)', 'count');
  const roles = [principalCount ? `${counted(principalCount, 'selectedProductIds')} sản phẩm chính` : '',
    peerCount ? `${counted(peerCount, 'peerProductIds')} sản phẩm đối chiếu` : ''].filter(Boolean);
  return roles.length ? `Gồm ${roles.join(' và ')} được chọn trong phạm vi đã xác nhận.`
    : 'Chưa có thông tin xác nhận vai trò sản phẩm chính và sản phẩm đối chiếu.';
}

/** The detail capture's own query window; the run's whole period only when the capture kept none. */
function observationWindow(row: Observation): Window {
  const raw = row.rawQuery as Partial<Observation['rawQuery']> | undefined;
  return raw?.start && raw.end ? { start: raw.start, end: raw.end } : { start: row.requestedWindow?.start ?? null, end: row.requestedWindow?.end ?? null };
}

function nextDay(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : new Date(time + 86_400_000).toISOString().slice(0, 10);
}

function observedDecimal(row: Observation): string | null {
  const decimal = row.value?.decimal;
  if (typeof decimal === 'string' && decimal.trim() !== '') return decimal;
  return /^\s*\{\s*"[^"\\]+"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?)\s*\}\s*$/.exec(row.value?.literal ?? '')?.[1] ?? null;
}

const isZero = (decimal: string | null): boolean => decimal !== null && /^-?0(?:\.0+)?$/.test(decimal);
const capitalized = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
const marks = (refs: readonly { sourceSha256: string; fieldPointer: string }[], trace: Trace): string => [...new Set(refs.map(trace))].join('');

/** M03 reader view: one row per product and query window, one column per measure. */
function readerPeriodSection(snapshot: AutomationMarketMethodSnapshot, trace: Trace, productLabels: ReadonlyMap<string, string> | undefined, reader?: MarketInventoryReaderContext): string {
  const names = productNamer(snapshot, productLabels);
  const measures: string[] = [];
  const vnd = new Set<string>();
  type Row = { keys: readonly string[]; window: Window; first: number; cells: Map<string, Observation[]>; observations: Observation[]; periods: number };
  const groups = new Map<string, Row>();
  snapshot.temporal.input.observations.forEach((observation, index) => {
    const keys = observation.subjectMemberKeys ?? [];
    const window = observationWindow(observation);
    const measure = observation.measure?.literal ?? '';
    if (!measures.includes(measure)) measures.push(measure);
    if (observation.measure?.currency === 'VND' || observation.measure?.unit === 'VND') vnd.add(measure);
    const id = JSON.stringify([keys, window.start, window.end]);
    const row: Row = groups.get(id) ?? { keys, window, first: index, cells: new Map(), observations: [], periods: 1 };
    row.cells.set(measure, [...(row.cells.get(measure) ?? []), observation]);
    row.observations.push(observation);
    groups.set(id, row);
  });
  const ordered = [...groups.values()].sort((a, b) => names.ordinal(a.keys) - names.ordinal(b.keys)
    || (a.window.start ?? '').localeCompare(b.window.start ?? '') || a.first - b.first);
  const noSales = (row: Row): boolean => row.cells.has('revenue') && (row.cells.has('sales_volumn') || row.cells.has('sales_volume'))
    && row.observations.every(observation => isZero(observedDecimal(observation)));
  // Back-to-back windows with no recorded sale for the same product read as one row, never as a sum.
  const rows: Row[] = [];
  for (const row of ordered) {
    const previous = rows.at(-1);
    if (previous && noSales(previous) && noSales(row) && JSON.stringify(previous.keys) === JSON.stringify(row.keys)
      && (!reader || (shortWindowDays(previous.window) === null && shortWindowDays(row.window) === null))
      && nextDay(previous.window.end) !== null && nextDay(previous.window.end) === row.window.start) {
      rows[rows.length - 1] = { ...previous, window: { start: previous.window.start, end: row.window.end },
        observations: [...previous.observations, ...row.observations], periods: previous.periods + row.periods };
    } else rows.push(row);
  }
  // Every number of the table is recorded against the stored observation it is read from.
  const at = (observation: Observation, field: string, value: string, role?: 'start' | 'end'): MarketTraceInput =>
    storedInput('stored-source', observation.source.sourceSha256, field === 'value' ? observation.source.fieldPointer : `/temporal/input/observations/${snapshot.temporal.input.observations.indexOf(observation)}/${field}`, value, role);
  const cell = (observations: readonly Observation[] | undefined): string => {
    if (!observations?.length) return 'Chưa có dữ liệu';
    return observations.map(observation => {
      const decimal = observedDecimal(observation);
      if (isZero(decimal)) return 'Không ghi nhận';
      const kind = readerValueKind({ measure: observation.measure?.literal, unit: observation.measure?.unit, currency: observation.measure?.currency });
      const text = formatReaderValue(decimal, { measure: observation.measure?.literal, unit: observation.measure?.unit, currency: observation.measure?.currency });
      return text === null ? 'Chưa có dữ liệu' : traceMarketNumber(text, 'M03.inventory.values', 'raw', [at(observation, 'value', decimal!)], `stored decimal, reader ${kind} format`, `reader-${kind}`);
    }).join('; ');
  };
  const windowOf = (row: Row): MarketTraceInput[] => {
    const first = row.observations[0]!, last = row.observations[row.observations.length - 1]!, field = (observation: Observation) => observation.rawQuery?.start && observation.rawQuery.end ? 'rawQuery' : 'requestedWindow';
    return [at(first, `${field(first)}/start`, row.window.start ?? '', 'start'), at(last, `${field(last)}/end`, row.window.end ?? '', 'end')];
  };
  const periodText = (row: Row): string => {
    const start = readerDate(row.window.start), end = readerDate(row.window.end), [startInput, endInput] = windowOf(row);
    return start && end ? `${traceMarketNumber(start, 'M03.inventory.period', 'raw', [startInput!], 'stored day dd/mm/yyyy', 'vi-date')} đến ${traceMarketNumber(end, 'M03.inventory.period', 'raw', [endInput!], 'stored day dd/mm/yyyy', 'vi-date')}`
      : windowText(row.window);
  };
  const platforms = reader ? rows.map(row => readerPlatform(snapshot, reader, row.keys)) : [];
  const platformColumn = platforms.some(platform => /Shopee|TikTok Shop/u.test(platform));
  const body = rows.map(row => {
    const values = noSales(row)
      ? `<td colspan="${measures.length}">${row.periods > 1 ? `Không ghi nhận bán trong ${escape(formatReaderCount(row.periods) === null ? 'các' : traceMarketNumber(formatReaderCount(row.periods)!, 'M03.inventory.periods', 'computed',
        [...new Map(row.observations.map(observation => [JSON.stringify(observationWindow(observation)), observation] as const)).values()].map(observation => at(observation, 'value', observedDecimal(observation) ?? '')), 'count(merged periods)', 'count'))} kỳ liền nhau` : 'Không ghi nhận bán trong kỳ'}</td>`
      : measures.map(measure => `<td>${escape(cell(row.cells.get(measure)))}</td>`).join('');
    const days = reader ? shortWindowDays(row.window) : null;
    const beyondSample = reader?.sampleWindow?.end && row.window.end && row.window.end > reader.sampleWindow.end
      ? `; vượt ngày cuối mẫu ${traceMarketNumber(readerDate(reader.sampleWindow.end)!, 'M03.inventory.period', 'raw', [storedInput('stored-source', 'market-sample-window', '/end', reader.sampleWindow.end)], 'sample end day dd/mm/yyyy', 'vi-date')}` : '';
    const period = periodText(row) + (days === null ? '' : `; kỳ chưa đủ (${traceMarketNumber(String(days), 'M03.inventory.period', 'computed', windowOf(row), 'inclusive days of the window', 'day-count')} ngày)`) + beyondSample;
    return `<tr${days === null ? '' : ' data-period-incomplete="true"'}>${platformColumn ? `<td>${escape(readerPlatform(snapshot, reader!, row.keys))}</td>` : ''}<td>${escape(names.label(row.keys))}</td><td>${escape(period)}</td>${values}<td>${marks(row.observations.map(observation => observation.source), trace)}</td></tr>`;
  }).join('');
  // Current reader: each measure states its unit once, in the header; count measures use the one sold-unit term.
  const headers = measures.map(measure => `<th>${escape(capitalized(readerMeasureName(measure)))}${vnd.has(measure) ? ' (VND)' : reader && (measure === 'sales_volumn' || measure === 'sales_volume') ? ' (đơn vị bán)' : ''}</th>`).join('');
  return '<p class="warning">Mỗi dòng là một kỳ đo riêng của một sản phẩm được chọn. Không cộng các kỳ thành tổng năm, không tính tăng trưởng và không gọi đây là quy mô thị trường.</p>' +
    (reader ? `<p>${escape(selectionText(reader, [...new Set(rows.flatMap(row => row.keys))]))}</p>` : '') +
    `<div class="table-wrap" role="region" aria-label="Số liệu theo kỳ của sản phẩm được chọn" tabindex="0"><table${reader ? ' data-market-periods="true"' : ''}><caption>Số liệu theo từng kỳ đo của các sản phẩm được chọn</caption><thead><tr>${platformColumn ? '<th>Sàn</th>' : ''}<th>Sản phẩm</th><th>Kỳ đo</th>${headers}<th>Nguồn</th></tr></thead><tbody>${body || `<tr><td colspan="${3 + measures.length + Number(platformColumn)}">Chưa có số liệu theo kỳ dùng được.</td></tr>`}</tbody></table></div>` +
    (reader ? '<p class="lim"><b>Chú thích:</b> Số liệu mẫu lấy từ trang kết quả tìm kiếm đã lưu; doanh thu chi tiết lấy từ trang sản phẩm theo kỳ riêng ghi trong bảng này. Vì vậy, số của cùng một sản phẩm ở hai nơi có thể khác nhau. Các tháng cao điểm lấy từ trang sản phẩm, không so sánh với mẫu tìm kiếm 30 ngày. Kỳ chưa đủ 30 ngày không dùng để diễn giải hay so sánh với kỳ đủ; ngày vượt cuối mẫu được giữ đúng bản thu, không cắt hay chia tỷ lệ số liệu. “Không ghi nhận bán” là nguồn không ghi lượt bán nào trong kỳ đó.</p>'
      : '<p class="lim"><b>Chú thích:</b> Số liệu lấy từ trang chi tiết của từng sản phẩm, theo từng kỳ đo. Bảng mẫu sản phẩm lấy từ trang kết quả tìm kiếm với kỳ và cách làm tròn khác, nên số của cùng một sản phẩm ở hai nơi có thể lệch nhau. “Không ghi nhận bán” là nguồn không ghi lượt bán nào trong kỳ đó.</p>');
}

/** Provider product id in the quote's stored offer text, matched to a run member key. */
function quoteMemberKey(quote: Quote, keys: readonly string[]): string | null {
  let id: unknown;
  try { id = (JSON.parse(quote.offerText ?? '') as { provider_product_id?: unknown } | null)?.provider_product_id; } catch { return null; }
  if (typeof id !== 'string' && typeof id !== 'number') return null;
  const text = String(id);
  return keys.find(key => key === text || key.slice(key.lastIndexOf(':') + 1) === text) ?? null;
}

/** Compare the retained nonnegative decimals without losing integer or fractional precision. */
function compareAmounts(a: string, b: string): number {
  const [aw = '0', af = ''] = a.split('.'), [bw = '0', bf = ''] = b.split('.');
  const scale = Math.max(af.length, bf.length);
  const left = BigInt(aw + af.padEnd(scale, '0')), right = BigInt(bw + bf.padEnd(scale, '0'));
  return left < right ? -1 : left > right ? 1 : 0;
}

function latestReaderPrices(snapshot: AutomationMarketMethodSnapshot, trace: Trace, productLabels: ReadonlyMap<string, string> | undefined, reader: MarketInventoryReaderContext): string {
  const labels = new Map([...(productLabels ?? [])].filter(([key, label]) => label.trim() !== key && label.trim() !== key.slice(key.lastIndexOf(':') + 1)));
  const names = productNamer(snapshot, labels);
  const knownKeys = [...new Set([...names.keys(), ...(productLabels?.keys() ?? []), ...reader.platforms.keys()])];
  const observations = new Map<string, Observation>();
  for (const row of snapshot.temporal.input.observations) {
    const ordinal = /^capture-(\d+)-/.exec(row.observationId ?? '')?.[1];
    if (ordinal !== undefined) observations.set(ordinal, row);
  }
  type Capture = { keys: readonly string[]; quotes: Quote[]; ordinal: number; acquiredAt: number; window: Window | null; index: number };
  const captures = new Map<string, Capture>();
  snapshot.quotes.input.quotes.forEach((quote, index) => {
    const ordinal = /^capture-(\d+)-/.exec(quote.quoteId)?.[1];
    const id = ordinal ?? `quote:${index}`;
    const observation = observations.get(ordinal ?? '');
    const retainedCapture = ordinal === undefined ? undefined : reader.captures?.find(capture => capture.stepId === 'COLLECTION' && capture.ordinal === Number(ordinal));
    const member = quoteMemberKey(quote, knownKeys);
    const acquiredAt = Date.parse(observation?.retrievedAt ?? retainedCapture?.retrievedAt ?? quote.acquiredAt ?? '');
    const capture = captures.get(id) ?? { keys: observation?.subjectMemberKeys?.length ? observation.subjectMemberKeys : member ? [member] : [], quotes: [], ordinal: Number(ordinal ?? index + 1), acquiredAt: Number.isFinite(acquiredAt) ? acquiredAt : Number.NEGATIVE_INFINITY,
      window: observation ? observationWindow(observation) : retainedCapture?.window ? { start: retainedCapture.window.startDate, end: retainedCapture.window.endDate } : null, index };
    capture.quotes.push(quote);
    captures.set(id, capture);
  });
  const products = new Map<string, Capture>();
  for (const capture of captures.values()) {
    const key = capture.keys.length ? JSON.stringify([...new Set(capture.keys)].sort()) : `quote:${capture.index}`;
    const previous = products.get(key);
    if (!previous || capture.acquiredAt > previous.acquiredAt || (capture.acquiredAt === previous.acquiredAt && capture.ordinal > previous.ordinal)) products.set(key, capture);
  }
  const money = (value: string | null | undefined): string | null => {
    if (!value || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || isZero(value)) return null;
    const formatted = formatReaderValue(value, { currency: 'VND' });
    return formatted === '0' ? null : formatted;
  };
  const average = reader.withoutAveragePrice !== true;
  let readable = false, missingRange = false;
  const bases: { label: string; basis: string }[] = [];
  const ordered = [...products.values()].sort((a, b) => names.ordinal(a.keys) - names.ordinal(b.keys) || a.index - b.index);
  const platforms = ordered.map(capture => readerPlatform(snapshot, reader, capture.keys, capture.quotes));
  const platformColumn = platforms.some(platform => /Shopee|TikTok Shop/u.test(platform));
  const rows = ordered.map((capture, index) => {
    const unit = capture.quotes.find(quote => !quote.price.range);
    const range = capture.quotes.find(quote => quote.price.range)?.price.range;
    const price = money(unit?.price.value);
    const minimum = money(range?.minimum), maximum = money(range?.maximum);
    const validRange = range && minimum && maximum && minimum !== maximum && compareAmounts(range.minimum, range.maximum) < 0
      && (price === null || (compareAmounts(range.minimum, unit!.price.value!) <= 0 && compareAmounts(unit!.price.value!, range.maximum) <= 0));
    readable ||= (average && price !== null) || Boolean(validRange);
    missingRange ||= !validRange;
    const candidate = capture.keys.length ? names.label(capture.keys).replace(/Sản phẩm #/g, 'Sản phẩm ') : '';
    const label = candidate && !containsForbiddenProviderName(candidate)
      ? candidate : `Sản phẩm ${formatReaderCount(capture.keys.length ? names.ordinal(capture.keys) : index + 1)}`;
    const platformLabel = platforms[index]!;
    const date = Number.isFinite(capture.acquiredAt) ? readerDate(new Date(capture.acquiredAt).toISOString().slice(0, 10)) : null;
    bases.push({ label: `${platformLabel} · ${label}`, basis: `${date ? `thu ngày ${date} (UTC)` : 'chưa rõ ngày thu'}; ${capture.window?.start && capture.window.end ? `kỳ ${windowText(capture.window)}` : 'chưa rõ kỳ đo'}` });
    return `<tr${capture.window && shortWindowDays(capture.window) !== null ? ' data-period-incomplete="true"' : ''}>${platformColumn ? `<td>${escape(platformLabel)}</td>` : ''}<td>${escape(label)}</td>${average ? `<td>${escape(price ?? 'Chưa có giá đọc được')}</td>` : ''}<td>${escape(validRange ? `${minimum} đến ${maximum}` : '—')}</td><td>${marks(capture.quotes.map(quote => quote.source), trace)}</td></tr>`;
  }).join('');
  const sharedBasis = bases.length > 0 && bases.every(row => row.basis === bases[0]!.basis);
  const basisNote = bases.length ? sharedBasis ? ` Tất cả sản phẩm: ${bases[0]!.basis}.`
    : ` Bản thu giữ lại của từng sản phẩm: ${bases.map(row => `${row.label}: ${row.basis}`).join('; ')}.` : '';
  return '<p class="warning">Chưa rõ phiên bản, combo hay điều kiện giá.</p>' +
    `<div class="table-wrap" role="region" aria-label="Giá tham khảo của từng sản phẩm" tabindex="0"><table data-market-prices="${readable ? 'reference' : 'unavailable'}"><caption>Giá tham khảo của từng sản phẩm</caption><thead><tr>${platformColumn ? '<th>Sàn</th>' : ''}<th>Sản phẩm</th>${average ? '<th>Giá bình quân do nguồn tính, ước tính (VND)</th>' : ''}<th>Khoảng giá nguồn (VND)</th><th>Nguồn</th></tr></thead><tbody>${rows || `<tr><td colspan="${3 + Number(average) + Number(platformColumn)}">Chưa có giá đọc được</td></tr>`}</tbody></table></div>` +
    `<p class="lim"><b>Chú thích:</b> Mỗi sản phẩm giữ lần thu sau cùng.${average ? ' Giá bình quân là số nguồn tính, chưa xác minh; chưa dùng để tính giá vốn hoặc lợi nhuận.' : ''}${escape(basisNote)}${missingRange ? ' Dấu “—” cho biết chưa có khoảng giá nguồn dùng được.' : ''}</p>`;
}

/** M08 reader view: listed price range once per product, then revenue ÷ units per query window as an estimate. */
function readerPriceSection(snapshot: AutomationMarketMethodSnapshot, trace: Trace, productLabels: ReadonlyMap<string, string> | undefined, withoutAveragePrice = false): string {
  const names = productNamer(snapshot, productLabels);
  const captures = new Map<string, { keys: readonly string[]; window: Window; observations: Observation[] }>();
  for (const observation of snapshot.temporal.input.observations) {
    const ordinal = /^capture-(\d+)-/.exec(observation.observationId ?? '')?.[1];
    if (ordinal !== undefined) {
      const capture = captures.get(ordinal) ?? { keys: observation.subjectMemberKeys ?? [], window: observationWindow(observation), observations: [] };
      capture.observations.push(observation);
      captures.set(ordinal, capture);
    }
  }
  const knownKeys = [...new Set([...names.keys(), ...snapshot.temporal.input.observations.flatMap(observation => observation.subjectMemberKeys ?? [])])];
  type Estimate = { keys: readonly string[]; window: Window | null; value: string; quote: Quote; index: number };
  type Listed = { keys: readonly string[]; label: string | null; minimum: string; maximum: string; sources: Quote['source'][]; index: number };
  const estimates: Estimate[] = [], listed = new Map<string, Listed>();
  let noSale = 0, zeroEstimate = 0, unreadable = 0;
  snapshot.quotes.input.quotes.forEach((quote, index) => {
    const capture = captures.get(/^capture-(\d+)-/.exec(quote.quoteId)?.[1] ?? '');
    const member = capture ? null : quoteMemberKey(quote, knownKeys);
    const keys = capture?.keys ?? (member ? [member] : []);
    if (quote.price.value !== null) {
      const units = capture?.observations.filter(row => row.measure.literal === 'sales_volumn' || row.measure.literal === 'sales_volume') ?? [];
      if (units.length && units.every(row => isZero(observedDecimal(row)))) noSale += 1;
      else if (isZero(quote.price.value)) zeroEstimate += 1;
      else estimates.push({ keys, window: capture?.window ?? null, value: quote.price.value, quote, index });
    } else if (quote.price.range) {
      const id = keys.length ? JSON.stringify(keys) : `quote:${index}`;
      const row: Listed = listed.get(id) ?? { keys, label: keys.length ? null : readerQuoteLabel(quote.quoteId, index + 1), ...quote.price.range, sources: [], index };
      if (compareAmounts(quote.price.range.minimum, row.minimum) < 0) row.minimum = quote.price.range.minimum;
      if (compareAmounts(quote.price.range.maximum, row.maximum) > 0) row.maximum = quote.price.range.maximum;
      row.sources.push(quote.source);
      listed.set(id, row);
    } else unreadable += 1;
  });
  const money = (value: string): string => isZero(value) ? 'Không đồng' : formatReaderValue(value, { currency: 'VND' }) ?? 'Giá được giữ trong bản lưu';
  const product = (keys: readonly string[], fallback: string): string => keys.length ? names.label(keys) : fallback;
  const listedRows = [...listed.values()].sort((a, b) => names.ordinal(a.keys) - names.ordinal(b.keys) || a.index - b.index)
    .map(row => `<tr><td>${escape(product(row.keys, row.label ?? 'Sản phẩm chưa xác định'))}</td><td>${escape(money(row.minimum))}</td><td>${escape(money(row.maximum))}</td><td>${marks(row.sources, trace)}</td></tr>`).join('');
  const estimateRows = estimates.sort((a, b) => names.ordinal(a.keys) - names.ordinal(b.keys) || (a.window?.start ?? '').localeCompare(b.window?.start ?? '') || a.index - b.index)
    .map(row => `<tr><td>${escape(product(row.keys, readerQuoteLabel(row.quote.quoteId, row.index + 1)))}</td><td>${escape(windowText(row.window))}</td><td>${escape(money(row.value))}</td><td>${trace(row.quote.source)}</td></tr>`).join('');
  const parts = ['<p class="warning">Chưa rõ phiên bản, combo hay điều kiện giá. Không tính biên lợi nhuận và không so sánh như cùng loại hàng.</p>'];
  if (listedRows) parts.push('<div class="table-wrap" role="region" aria-label="Giá do nguồn ghi cho từng sản phẩm" tabindex="0"><table><caption>Giá do nguồn ghi cho từng sản phẩm</caption><thead><tr><th>Sản phẩm</th><th>Giá từ (VND)</th><th>Giá đến (VND)</th><th>Nguồn</th></tr></thead><tbody>' + listedRows + '</tbody></table></div>' +
    '<p class="lim"><b>Chú thích:</b> Khoảng giá bao quát các mức nguồn ghi cho từng sản phẩm qua các lần thu đã lưu; hai số bằng nhau khi nguồn chỉ ghi một mức giá. Các lần thu có thể có kỳ đo và điều kiện giá khác nhau.</p>');
  if (estimateRows && !withoutAveragePrice) parts.push('<div class="table-wrap" role="region" aria-label="Doanh thu chia sản lượng bán theo kỳ" tabindex="0"><table><caption>Doanh thu chia sản lượng bán theo kỳ (ước tính, không phải giá niêm yết)</caption><thead><tr><th>Sản phẩm</th><th>Kỳ đo</th><th>Doanh thu chia sản lượng bán (VND)</th><th>Nguồn</th></tr></thead><tbody>' + estimateRows + '</tbody></table></div>' +
    '<p class="lim"><b>Chú thích:</b> Số ước tính bằng doanh thu chia sản lượng bán trong từng kỳ; có thể khác giá nguồn ghi vì khuyến mãi, phiên bản hoặc combo.</p>');
  if (!listedRows && (!estimateRows || withoutAveragePrice)) parts.push('<p>Chưa có giá nguồn dùng được.</p>');
  if (noSale && !withoutAveragePrice) parts.push(`<p>Có ${escape(formatReaderCount(noSale))} bản ghi thuộc kỳ không ghi nhận lượt bán; không đưa vào bảng ước tính vì không thể chia cho sản lượng bằng không.</p>`);
  if (zeroEstimate && !withoutAveragePrice) parts.push(`<p>Có ${escape(formatReaderCount(zeroEstimate))} bản ghi ước tính bằng không; không đưa vào bảng. Giá trị này không đủ để kết luận kỳ đó không có lượt bán.</p>`);
  if (unreadable) parts.push(`<p>Có ${escape(formatReaderCount(unreadable) ?? 'một số')} bản ghi giá không đọc được; không đưa vào bảng.</p>`);
  return parts.join('');
}
